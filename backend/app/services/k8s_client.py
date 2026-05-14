"""Shared Kubernetes client bootstrap.

Centralizes how the backend finds and loads a kubeconfig, AND the Docker-mode
host rewrite that lets the container reach a KinD / minikube / k3d API server
running on the host. Used by both the deployment-metrics path and the cluster-
metrics path so the two never drift apart.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_k8s_loaded = False


def rewrite_localhost_for_docker() -> None:
    """If the loaded kubeconfig points at 127.0.0.1 / localhost (typical for KinD,
    minikube, k3d), and we're running inside a Docker container, rewrite the
    server URL to host.docker.internal so we can actually reach the API server.

    Idempotent — safe to call after each load_kube_config().
    """
    from kubernetes import client as k8s_client

    cfg = k8s_client.Configuration.get_default_copy()
    host = cfg.host or ""
    needs_rewrite = (
        "127.0.0.1" in host
        or "//localhost" in host
        or "//0.0.0.0" in host
    )
    if not needs_rewrite:
        return
    # Only rewrite if we're actually inside Docker (the host alias resolves there).
    if not os.path.exists("/.dockerenv"):
        return

    new_host = (
        host.replace("127.0.0.1", "host.docker.internal")
            .replace("//localhost", "//host.docker.internal")
            .replace("//0.0.0.0", "//host.docker.internal")
    )
    cfg.host = new_host
    # KinD/minikube self-signed certs are issued for the original IP, not for
    # host.docker.internal. Skip TLS verification for the rewritten host.
    cfg.verify_ssl = False
    k8s_client.Configuration.set_default(cfg)


def ensure_k8s_loaded() -> None:
    """Load kubeconfig (once per process) and apply the Docker host rewrite
    (on EVERY call, so it self-heals after any module that calls
    `load_kube_config()` without the rewrite — which would otherwise reset the
    process-global `Configuration` singleton back to 127.0.0.1).

    Search order for the initial load:
      1. In-cluster service-account credentials (when running as a pod)
      2. $KUBECONFIG env var (single path or colon/semicolon-separated list)
      3. /app/kubeconfig (legacy bake-in path)
      4. ~/.kube/config (default location)
    """
    global _k8s_loaded
    if not _k8s_loaded:
        from kubernetes import config as k8s_config

        # 1. running inside a k8s pod with a service account?
        in_cluster = False
        try:
            k8s_config.load_incluster_config()
            in_cluster = True
        except Exception:
            pass

        if not in_cluster:
            loaded = False
            # 2. honor $KUBECONFIG env var (may be a single path or list)
            env_cfg = os.environ.get("KUBECONFIG")
            if env_cfg:
                for path in env_cfg.replace(";", ":").split(":"):
                    path = path.strip()
                    if path and os.path.exists(path):
                        k8s_config.load_kube_config(config_file=path)
                        loaded = True
                        break

            # 3. legacy fallback baked into early platform versions
            if not loaded and os.path.exists("/app/kubeconfig"):
                k8s_config.load_kube_config(config_file="/app/kubeconfig")
                loaded = True

            # 4. last resort — default location (~/.kube/config).
            if not loaded:
                k8s_config.load_kube_config()

        _k8s_loaded = True

    # ALWAYS run the rewrite. It's a no-op if Configuration.host already points
    # at host.docker.internal — but if some other module just called
    # load_kube_config() and reset the singleton to 127.0.0.1, this is what
    # heals it before the next API call.
    rewrite_localhost_for_docker()


def reset_k8s_loaded() -> None:
    """Test helper — force the next ensure_k8s_loaded() call to re-load from disk."""
    global _k8s_loaded
    _k8s_loaded = False

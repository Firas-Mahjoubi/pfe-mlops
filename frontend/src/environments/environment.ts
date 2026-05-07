// Production build — served by nginx via /etc/nginx/conf.d/default.conf,
// which proxies /api/* to the in-cluster backend service. Use a relative
// base URL so the frontend works at any hostname (Azure DNS, custom domain, etc.).
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
};

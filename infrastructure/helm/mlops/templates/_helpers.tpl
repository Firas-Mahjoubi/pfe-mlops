{{/* Common labels applied to all resources */}}
{{- define "mlops.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}

{{/* Selector labels for matchLabels — must NOT change between releases */}}
{{- define "mlops.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Full image reference */}}
{{- define "mlops.image" -}}
{{- $registry := .root.Values.image.registry -}}
{{- $repo := .repo -}}
{{- $tag := .root.Values.image.tag -}}
{{ printf "%s/%s:%s" $registry $repo $tag }}
{{- end -}}

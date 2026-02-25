{{- define "finaware.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "finaware.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "finaware.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "finaware.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "finaware.labels" -}}
helm.sh/chart: {{ include "finaware.chart" . }}
app.kubernetes.io/name: {{ include "finaware.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "finaware.selectorLabels" -}}
app.kubernetes.io/name: {{ include "finaware.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "finaware.serviceFullname" -}}
{{- $context := index . "context" -}}
{{- $name := index . "name" -}}
{{- printf "%s-%s" (include "finaware.fullname" $context) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

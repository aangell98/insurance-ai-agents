{{- define "insurance-ai-agents.fullname" }}{{ .Release.Name }}{{ end }}
{{- define "insurance-ai-agents.labels" }}app.kubernetes.io/name: insurance-ai-agents{{ end }}
{{- define "insurance-ai-agents.selectorLabels" }}app.kubernetes.io/name: insurance-ai-agents{{ end }}

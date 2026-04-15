package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"
	"text/template"
	"time"
)

// EmailSender sends notifications via SMTP.
type EmailSender struct{}

func (e *EmailSender) Name() string { return "email" }

func (e *EmailSender) Send(ctx context.Context, ch Channel, msg Message) error {
	host := ch.Config["smtp_host"]
	port := ch.Config["smtp_port"]
	user := ch.Config["smtp_user"]
	pass := ch.Config["smtp_pass"]
	from := ch.Config["from"]
	to := ch.Config["to"]

	if host == "" || from == "" || to == "" {
		return fmt.Errorf("email: missing smtp_host, from, or to")
	}
	if port == "" {
		port = "587"
	}

	body := fmt.Sprintf("Subject: %s\r\nFrom: %s\r\nTo: %s\r\n\r\n%s", msg.Title, from, to, msg.Body)
	addr := host + ":" + port

	var auth smtp.Auth
	if user != "" && pass != "" {
		auth = smtp.PlainAuth("", user, pass, host)
	}

	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(body)); err != nil {
		return fmt.Errorf("email send: %w", err)
	}
	return nil
}

// WebhookSender sends a JSON payload to an arbitrary HTTP endpoint.
type WebhookSender struct{}

func (w *WebhookSender) Name() string { return "webhook" }

// defaultTemplate is the default JSON payload template for webhooks.
const defaultTemplate = `{"title":"{{.Title}}","body":"{{.Body}}","severity":"{{.Severity}}","event":"{{.EventType}}","timestamp":"{{.Timestamp}}"}`

func (w *WebhookSender) Send(ctx context.Context, ch Channel, msg Message) error {
	webhookURL := ch.Config["url"]
	if webhookURL == "" {
		return fmt.Errorf("webhook: missing url")
	}

	tmplStr := ch.Config["template"]
	if tmplStr == "" {
		tmplStr = defaultTemplate
	}

	tmpl, err := template.New("webhook").Parse(tmplStr)
	if err != nil {
		return fmt.Errorf("webhook template parse: %w", err)
	}

	data := struct {
		Title     string
		Body      string
		Severity  string
		EventType string
		Timestamp string
	}{
		Title:     msg.Title,
		Body:      msg.Body,
		Severity:  string(msg.Severity),
		EventType: msg.EventType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Errorf("webhook template execute: %w", err)
	}

	// Validate template output is valid JSON before sending.
	if !json.Valid(buf.Bytes()) {
		return fmt.Errorf("webhook template produced invalid JSON")
	}

	method := strings.ToUpper(ch.Config["method"])
	if method == "" {
		method = http.MethodPost
	}

	req, err := http.NewRequestWithContext(ctx, method, webhookURL, &buf)
	if err != nil {
		return fmt.Errorf("webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token := ch.Config["bearer"]; token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook error: status %d", resp.StatusCode)
	}
	return nil
}

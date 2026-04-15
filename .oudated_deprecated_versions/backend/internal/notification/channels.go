package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// TelegramSender sends messages via the Telegram Bot API.
type TelegramSender struct{}

func (t *TelegramSender) Name() string { return "telegram" }

func (t *TelegramSender) Send(ctx context.Context, ch Channel, msg Message) error {
	token := ch.Config["bot_token"]
	chatID := ch.Config["chat_id"]
	if token == "" || chatID == "" {
		return fmt.Errorf("telegram: missing bot_token or chat_id")
	}

	text := fmt.Sprintf("*%s*\n%s", escapeMarkdown(msg.Title), escapeMarkdown(msg.Body))
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "MarkdownV2",
	})

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("telegram send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("telegram API error: status %d", resp.StatusCode)
	}
	return nil
}

func escapeMarkdown(s string) string {
	// Escape Telegram MarkdownV2 special characters.
	special := `_*[]()~`+"`"+`>#+-=|{}.!`
	out := make([]byte, 0, len(s)*2)
	for _, c := range []byte(s) {
		if bytes.ContainsRune([]byte(special), rune(c)) {
			out = append(out, '\\')
		}
		out = append(out, c)
	}
	return string(out)
}

// DiscordSender sends messages via a Discord webhook.
type DiscordSender struct{}

func (d *DiscordSender) Name() string { return "discord" }

func (d *DiscordSender) Send(ctx context.Context, ch Channel, msg Message) error {
	webhookURL := ch.Config["webhook_url"]
	if webhookURL == "" {
		return fmt.Errorf("discord: missing webhook_url")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"content": fmt.Sprintf("**%s**\n%s", msg.Title, msg.Body),
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("discord request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("discord send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord webhook error: status %d", resp.StatusCode)
	}
	return nil
}

// GotifySender sends messages via Gotify push server.
type GotifySender struct{}

func (g *GotifySender) Name() string { return "gotify" }

func (g *GotifySender) Send(ctx context.Context, ch Channel, msg Message) error {
	serverURL := ch.Config["server_url"]
	appToken := ch.Config["app_token"]
	if serverURL == "" || appToken == "" {
		return fmt.Errorf("gotify: missing server_url or app_token")
	}

	priority := 5
	if msg.Severity == SeverityCritical {
		priority = 9
	}

	body, _ := json.Marshal(map[string]interface{}{
		"title":    msg.Title,
		"message":  msg.Body,
		"priority": priority,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serverURL+"/message?token="+appToken, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("gotify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("gotify send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("gotify error: status %d", resp.StatusCode)
	}
	return nil
}

// NtfySender sends notifications via ntfy.sh or self-hosted ntfy.
type NtfySender struct{}

func (n *NtfySender) Name() string { return "ntfy" }

func (n *NtfySender) Send(ctx context.Context, ch Channel, msg Message) error {
	serverURL := ch.Config["server_url"]
	topic := ch.Config["topic"]
	if serverURL == "" {
		serverURL = "https://ntfy.sh"
	}
	if topic == "" {
		return fmt.Errorf("ntfy: missing topic")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serverURL+"/"+topic, bytes.NewBufferString(msg.Body))
	if err != nil {
		return fmt.Errorf("ntfy request: %w", err)
	}
	req.Header.Set("Title", msg.Title)
	if token := ch.Config["token"]; token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	switch msg.Severity {
	case SeverityCritical:
		req.Header.Set("Priority", "urgent")
	case SeverityWarning:
		req.Header.Set("Priority", "high")
	default:
		req.Header.Set("Priority", "default")
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("ntfy send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ntfy error: status %d", resp.StatusCode)
	}
	return nil
}

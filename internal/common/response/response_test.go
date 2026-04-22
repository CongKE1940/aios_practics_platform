package response

import "testing"

func TestSuccessEnvelopeKeepsRequestID(t *testing.T) {
	body := Success(map[string]string{"status": "ok"}, "req_123")

	if body.Code != 0 {
		t.Fatalf("Code = %d", body.Code)
	}
	if body.Message != "ok" {
		t.Fatalf("Message = %q", body.Message)
	}
	if body.RequestID != "req_123" {
		t.Fatalf("RequestID = %q", body.RequestID)
	}
	if body.Data == nil {
		t.Fatal("Data = nil")
	}
}

func TestFailureEnvelopeHasStableCode(t *testing.T) {
	body := Failure(40001, "missing tenant context", "req_456")

	if body.Code != 40001 {
		t.Fatalf("Code = %d", body.Code)
	}
	if body.Message != "missing tenant context" {
		t.Fatalf("Message = %q", body.Message)
	}
	if body.RequestID != "req_456" {
		t.Fatalf("RequestID = %q", body.RequestID)
	}
}

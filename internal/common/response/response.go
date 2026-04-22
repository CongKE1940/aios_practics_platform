package response

type Envelope struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      any    `json:"data,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

func Success(data any, requestID string) Envelope {
	return Envelope{
		Code:      0,
		Message:   "ok",
		Data:      data,
		RequestID: requestID,
	}
}

func Failure(code int, message string, requestID string) Envelope {
	return Envelope{
		Code:      code,
		Message:   message,
		RequestID: requestID,
	}
}

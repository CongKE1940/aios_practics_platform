package fileasset

import "testing"

func TestMinIOPublicURLUsesPathStyleBucket(t *testing.T) {
	store := &MinIOContentStore{
		bucket:         "aios-assets",
		publicEndpoint: "http://192.168.1.135:9000",
	}

	url := store.PublicURL("tenant/1/question_asset/20260507/题目 图.png")
	want := "http://192.168.1.135:9000/aios-assets/tenant/1/question_asset/20260507/%E9%A2%98%E7%9B%AE%20%E5%9B%BE.png"
	if url != want {
		t.Fatalf("PublicURL() = %q, want %q", url, want)
	}
}

func TestNormalizeMinIOEndpoint(t *testing.T) {
	endpoint, secure, err := normalizeMinIOEndpoint("https://minio.example.com:9000")
	if err != nil {
		t.Fatalf("normalizeMinIOEndpoint() error = %v", err)
	}
	if endpoint != "minio.example.com:9000" || !secure {
		t.Fatalf("endpoint=%q secure=%v", endpoint, secure)
	}
}

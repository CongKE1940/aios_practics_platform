package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

type DailyFileLogger struct {
	File *os.File
	Path string
}

func SetupDailyFileLogger(logDir string, prefix string) (DailyFileLogger, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return DailyFileLogger{}, fmt.Errorf("create log dir: %w", err)
	}

	filename := fmt.Sprintf("%s_%s.log", prefix, time.Now().Format("20060102"))
	path := filepath.Join(logDir, filename)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return DailyFileLogger{}, fmt.Errorf("open log file: %w", err)
	}

	writer := io.MultiWriter(os.Stdout, file)
	log.SetOutput(writer)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	gin.DefaultWriter = writer
	gin.DefaultErrorWriter = writer

	return DailyFileLogger{File: file, Path: path}, nil
}

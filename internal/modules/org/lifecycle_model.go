package org

import "time"

const StatusEnded = "ended"

type EndGradeInput struct {
	EndedAt time.Time `json:"ended_at" binding:"required"`
	Remark  string    `json:"remark"`
}

type EndClassInput struct {
	EndedAt time.Time `json:"ended_at" binding:"required"`
	Remark  string    `json:"remark"`
}

type orgLifecycle struct {
	ID       int64
	TenantID int64
	SchoolID int64
	GradeID  int64
	ClassID  int64
	Status   string
	EndedAt  *time.Time
}

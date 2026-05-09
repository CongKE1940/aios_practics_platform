package org

import "time"

type StudentMembershipHistoryFilter struct {
	StudentID int64
	SchoolID  int64
	GradeID   int64
	ClassID   int64
	PeriodID  int64
	StartAt   *time.Time
	EndAt     *time.Time
	Page      int
	PageSize  int
}

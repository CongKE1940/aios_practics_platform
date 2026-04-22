package main

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	_ "github.com/go-sql-driver/mysql"

	"aios_practice_platform/internal/bootstrap"
	"aios_practice_platform/internal/common/config"
	"aios_practice_platform/internal/modules/auth"
	"aios_practice_platform/internal/modules/fileasset"
	"aios_practice_platform/internal/modules/importjob"
	"aios_practice_platform/internal/modules/notice"
	"aios_practice_platform/internal/modules/org"
	"aios_practice_platform/internal/modules/question"
	"aios_practice_platform/internal/modules/questionbank"
	"aios_practice_platform/internal/modules/rbac"
	"aios_practice_platform/internal/modules/usermgmt"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	options := make([]bootstrap.RouterOption, 0)
	if cfg.Database.DSN != "" {
		db, err := sql.Open("mysql", cfg.Database.DSN)
		if err != nil {
			log.Fatalf("open database: %v", err)
		}
		defer db.Close()

		issuer := auth.NewJWTIssuer(auth.JWTConfig{
			Secret:         cfg.Auth.JWTSecret,
			AccessTokenTTL: time.Duration(cfg.Auth.AccessTokenTTLSeconds) * time.Second,
		})
		authHandler := auth.NewHandler(auth.NewService(
			auth.NewMySQLUserRepository(db),
			auth.BcryptPasswordVerifier{},
			issuer,
		))
		menuHandler := rbac.NewMenuHandler(issuer)
		rbacAdminHandler := rbac.NewAdminHandler(rbac.NewAdminService(rbac.NewMySQLAdminRepository(db)), issuer)
		fileHandler := fileasset.NewHandler(fileasset.NewService(fileasset.NewMySQLRepository(db)), issuer)
		importHandler := importjob.NewHandler(importjob.NewService(importjob.NewMySQLRepository(db)), issuer)
		orgHandler := org.NewHandler(
			org.NewService(org.NewMySQLRepository(db)),
			issuer,
		)
		questionBankHandler := questionbank.NewHandler(
			questionbank.NewService(questionbank.NewMySQLRepository(db)),
			issuer,
		)
		questionHandler := question.NewHandler(
			question.NewService(question.NewMySQLRepository(db)),
			issuer,
		)
		noticeHandler := notice.NewHandler(
			notice.NewService(notice.NewMySQLRepository(db)),
			issuer,
		)
		userHandler := usermgmt.NewHandler(usermgmt.NewService(usermgmt.NewMySQLRepository(db)), issuer)
		options = append(options,
			bootstrap.WithAPIV1Routes(authHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(noticeHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(orgHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(questionBankHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(questionHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(importHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(menuHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(rbacAdminHandler.RegisterAdminRoutes),
			bootstrap.WithAPIV1Routes(fileHandler.RegisterRoutes),
			bootstrap.WithAPIV1Routes(userHandler.RegisterRoutes),
		)
	}

	server := &http.Server{
		Addr:              cfg.HTTP.Addr,
		Handler:           bootstrap.NewRouter(cfg, options...),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("aios practice platform server listening on %s", cfg.HTTP.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server stopped: %v", err)
	}
}

-- ================================================
-- RESET COMPLETO DO BANCO DE DADOS - PC Builder AI
-- Execute no MySQL Workbench: abra e clique em Execute (raio)
-- ================================================

-- Corrige autenticação MySQL 8 para o Node.js funcionar
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'Lopes2417@';
ALTER USER 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'Lopes2417@';
FLUSH PRIVILEGES;

-- Remove e recria o banco limpo
DROP DATABASE IF EXISTS Pc_Builder_Unico;
CREATE DATABASE Pc_Builder_Unico
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE Pc_Builder_Unico;

-- ------------------------------------------------
-- 1. Usuários
-- ------------------------------------------------
CREATE TABLE Usuarios (
    Id          INT          AUTO_INCREMENT PRIMARY KEY,
    Email       VARCHAR(255) NOT NULL UNIQUE,
    Senha       VARCHAR(255) NOT NULL,
    Nome        VARCHAR(150) NULL,
    DataCriacao TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UltimoLogin TIMESTAMP    NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------
-- 2. Builds geradas pela IA
-- ------------------------------------------------
CREATE TABLE Builds (
    Id           INT           AUTO_INCREMENT PRIMARY KEY,
    EmailDestino VARCHAR(255)  NOT NULL,
    Objetivo     TEXT          NOT NULL,
    Orcamento    DECIMAL(10,2) NOT NULL,
    TotalGasto   DECIMAL(10,2) NULL,
    Economia     DECIMAL(10,2) NULL,
    ResumoGeral  TEXT          NULL,
    DataCriacao  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (EmailDestino)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------
-- 3. Componentes de cada Build
-- ------------------------------------------------
CREATE TABLE BuildComponentes (
    Id            INT           AUTO_INCREMENT PRIMARY KEY,
    BuildId       INT           NOT NULL,
    Componente    VARCHAR(100)  NULL,
    Produto       VARCHAR(255)  NULL,
    Preco         DECIMAL(10,2) NULL,
    Loja          VARCHAR(100)  NULL,
    Url           TEXT          NULL,
    Disponivel    TINYINT(1)    DEFAULT 1,
    Justificativa TEXT          NULL,
    FOREIGN KEY (BuildId) REFERENCES Builds(Id) ON DELETE CASCADE,
    INDEX idx_build (BuildId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------
-- 4. Log de scraping (rastrear falhas por loja)
-- ------------------------------------------------
CREATE TABLE ScrapingLog (
    Id          INT          AUTO_INCREMENT PRIMARY KEY,
    Componente  VARCHAR(255) NOT NULL,
    Loja        VARCHAR(100) NOT NULL,
    Sucesso     TINYINT(1)   DEFAULT 0,
    Preco       DECIMAL(10,2) NULL,
    Erro        TEXT         NULL,
    DataHora    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_loja (Loja),
    INDEX idx_data (DataHora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------
-- 5. Sessões ativas
-- ------------------------------------------------
CREATE TABLE Sessoes (
    Id         INT          AUTO_INCREMENT PRIMARY KEY,
    UsuarioId  INT          NOT NULL,
    Token      VARCHAR(255) NOT NULL UNIQUE,
    CriadoEm  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    ExpiraEm  TIMESTAMP    NOT NULL,
    FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id) ON DELETE CASCADE,
    INDEX idx_token (Token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verifica resultado
SELECT 'Banco Pc_Builder_Unico recriado com sucesso!' AS RESULTADO;
SHOW TABLES;

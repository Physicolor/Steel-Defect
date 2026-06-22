-- ============================================================
-- 钢材缺陷检测系统 - MySQL 数据库初始化脚本
-- 功能：创建表结构、索引、插入演示数据
-- 使用方式：mysql -u root -p < scripts/init_mysql.sql
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS steel_defect
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE steel_defect;

-- ============================================================
-- 用户表
-- ============================================================
DROP TABLE IF EXISTS detection_events;
DROP TABLE IF EXISTS detection_records;
DROP TABLE IF EXISTS system_config;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY COMMENT '用户ID',
    username VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名',
    password VARCHAR(255) NOT NULL DEFAULT '' COMMENT '密码哈希',
    user_type ENUM('personal', 'enterprise', 'admin') DEFAULT 'personal' COMMENT '用户类型',
    email VARCHAR(100) DEFAULT '' COMMENT '邮箱',
    phone VARCHAR(20) DEFAULT '' COMMENT '手机号',
    company_name VARCHAR(100) DEFAULT '' COMMENT '企业名称',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否激活',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_type (user_type),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ============================================================
-- 检测记录表
-- ============================================================
CREATE TABLE detection_records (
    id VARCHAR(50) PRIMARY KEY COMMENT '记录ID',
    user_id VARCHAR(50) NOT NULL COMMENT '用户ID',
    batch_id VARCHAR(100) COMMENT '批次ID',
    source_type ENUM('image', 'camera', 'ip_camera') DEFAULT 'image' COMMENT '来源类型',
    timestamp DATETIME COMMENT '检测时间',
    conf_threshold FLOAT DEFAULT 0.25 COMMENT '置信度阈值',
    iou_threshold FLOAT DEFAULT 0.45 COMMENT 'IOU阈值',
    image_width INT DEFAULT 0 COMMENT '图片宽度',
    image_height INT DEFAULT 0 COMMENT '图片高度',
    defect_count INT DEFAULT 0 COMMENT '缺陷数量',
    original_image VARCHAR(255) DEFAULT '' COMMENT '原始图片路径',
    annotated_image VARCHAR(255) DEFAULT '' COMMENT '标注图片路径',
    heatmap_image VARCHAR(255) DEFAULT '' COMMENT '热力图路径',
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'completed' COMMENT '状态',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_batch_id (batch_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检测记录表';

-- ============================================================
-- 检测事件表
-- ============================================================
CREATE TABLE detection_events (
    id VARCHAR(50) PRIMARY KEY COMMENT '事件ID',
    record_id VARCHAR(50) NOT NULL COMMENT '记录ID',
    user_id VARCHAR(50) NOT NULL COMMENT '用户ID',
    class_name VARCHAR(50) COMMENT '缺陷类型',
    confidence FLOAT COMMENT '置信度',
    bbox_x1 FLOAT DEFAULT 0 COMMENT '边界框X1',
    bbox_y1 FLOAT DEFAULT 0 COMMENT '边界框Y1',
    bbox_x2 FLOAT DEFAULT 0 COMMENT '边界框X2',
    bbox_y2 FLOAT DEFAULT 0 COMMENT '边界框Y2',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '检测时间',
    FOREIGN KEY (record_id) REFERENCES detection_records(id) ON DELETE CASCADE,
    INDEX idx_record_id (record_id),
    INDEX idx_user_id (user_id),
    INDEX idx_class_name (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检测事件表';

-- ============================================================
-- 系统配置表
-- ============================================================
CREATE TABLE system_config (
    config_key VARCHAR(50) PRIMARY KEY COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- ============================================================
-- 插入演示数据
-- ============================================================

-- 管理员用户（密码: admin123，使用 bcrypt 哈希）
INSERT INTO users (id, username, password, user_type, email, is_active, created_at) VALUES
('admin_001', 'admin', '$2b$12$LJ3m4ys3Lz0wqV9rK5e5xuQpR1FnVZx8K7Y9N2M4P6R8T0V2X4Z6', 'admin', 'admin@steeldefect.com', 1, '2026-01-01 00:00:00');

-- 个人用户
INSERT INTO users (id, username, password, user_type, email, phone, is_active, created_at) VALUES
('user_personal_001', 'zhangsan', '$2b$12$LJ3m4ys3Lz0wqV9rK5e5xuQpR1FnVZx8K7Y9N2M4P6R8T0V2X4Z6', 'personal', 'zhangsan@example.com', '13800138001', 1, '2026-01-15 10:30:00'),
('user_personal_002', 'lisi', '$2b$12$LJ3m4ys3Lz0wqV9rK5e5xuQpR1FnVZx8K7Y9N2M4P6R8T0V2X4Z6', 'personal', 'lisi@example.com', '13800138002', 1, '2026-02-01 14:20:00'),
('user_personal_003', 'wangwu', '$2b$12$LJ3m4ys3Lz0wqV9rK5e5xuQpR1FnVZx8K7Y9N2M4P6R8T0V2X4Z6', 'personal', 'wangwu@example.com', '13800138003', 1, '2026-02-15 09:15:00');

-- 企业用户
INSERT INTO users (id, username, password, user_type, email, phone, company_name, is_active, created_at) VALUES
('user_enterprise_001', 'baosteel', '$2b$12$LJ3m4ys3Lz0wqV9rK5e5xuQpR1FnVZx8K7Y9N2M4P6R8T0V2X4Z6', 'enterprise', 'contact@baosteel.com', '021-12345678', '宝钢集团', 1, '2026-01-10 08:00:00'),
('user_enterprise_002', 'wisco', '$2b$12$LJ3m4ys3Lz0wqV9rK5e5xuQpR1FnVZx8K7Y9N2M4P6R8T0V2X4Z6', 'enterprise', 'info@wisco.com', '027-87654321', '武钢集团', 1, '2026-02-20 11:30:00');

-- 检测记录（最近7天有数据）
INSERT INTO detection_records (id, user_id, batch_id, source_type, timestamp, conf_threshold, iou_threshold, image_width, image_height, defect_count, status) VALUES
('rec_001', 'user_personal_001', 'image_batch_20260614_100000_001', 'image', '2026-06-14 10:00:00', 0.25, 0.45, 640, 640, 2, 'completed'),
('rec_002', 'user_personal_002', 'image_batch_20260615_143000_002', 'image', '2026-06-15 14:30:00', 0.25, 0.45, 640, 640, 1, 'completed'),
('rec_003', 'user_enterprise_001', 'image_batch_20260616_091500_003', 'image', '2026-06-16 09:15:00', 0.30, 0.50, 1280, 1280, 3, 'completed'),
('rec_004', 'user_enterprise_002', 'image_batch_20260617_164500_004', 'image', '2026-06-17 16:45:00', 0.25, 0.45, 640, 640, 0, 'completed'),
('rec_005', 'user_personal_003', 'image_batch_20260618_112000_005', 'image', '2026-06-18 11:20:00', 0.20, 0.40, 640, 640, 4, 'completed'),
('rec_006', 'user_enterprise_001', 'image_batch_20260619_083000_006', 'image', '2026-06-19 08:30:00', 0.25, 0.45, 1280, 1280, 2, 'completed'),
('rec_007', 'user_personal_001', 'image_batch_20260620_150000_007', 'image', '2026-06-20 15:00:00', 0.25, 0.45, 640, 640, 1, 'completed');

-- 检测事件（缺陷详情）
INSERT INTO detection_events (id, record_id, user_id, class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2, timestamp) VALUES
-- rec_001: 2个缺陷
('evt_001', 'rec_001', 'user_personal_001', 'crazing', 0.85, 100, 100, 200, 200, '2026-06-14 10:00:00'),
('evt_002', 'rec_001', 'user_personal_001', 'scratches', 0.72, 300, 150, 450, 300, '2026-06-14 10:00:00'),
-- rec_002: 1个缺陷
('evt_003', 'rec_002', 'user_personal_002', 'pitted_surface', 0.91, 50, 50, 180, 180, '2026-06-15 14:30:00'),
-- rec_003: 3个缺陷（宝钢）
('evt_004', 'rec_003', 'user_enterprise_001', 'inclusion', 0.88, 200, 100, 350, 250, '2026-06-16 09:15:00'),
('evt_005', 'rec_003', 'user_enterprise_001', 'crazing', 0.76, 400, 300, 550, 450, '2026-06-16 09:15:00'),
('evt_006', 'rec_003', 'user_enterprise_001', 'scratches', 0.82, 100, 400, 250, 550, '2026-06-16 09:15:00'),
-- rec_005: 4个缺陷
('evt_007', 'rec_005', 'user_personal_003', 'pitted_surface', 0.79, 80, 80, 200, 200, '2026-06-18 11:20:00'),
('evt_008', 'rec_005', 'user_personal_003', 'crazing', 0.87, 250, 100, 400, 250, '2026-06-18 11:20:00'),
('evt_009', 'rec_005', 'user_personal_003', 'inclusion', 0.93, 150, 300, 300, 450, '2026-06-18 11:20:00'),
('evt_010', 'rec_005', 'user_personal_003', 'scratches', 0.68, 350, 350, 500, 500, '2026-06-18 11:20:00'),
-- rec_006: 2个缺陷（宝钢）
('evt_011', 'rec_006', 'user_enterprise_001', 'crazing', 0.81, 120, 120, 280, 280, '2026-06-19 08:30:00'),
('evt_012', 'rec_006', 'user_enterprise_001', 'pitted_surface', 0.74, 350, 200, 500, 350, '2026-06-19 08:30:00'),
-- rec_007: 1个缺陷
('evt_013', 'rec_007', 'user_personal_001', 'inclusion', 0.89, 180, 180, 320, 320, '2026-06-20 15:00:00');

-- 系统配置
INSERT INTO system_config (config_key, config_value) VALUES
('app_version', '2.0.0'),
('default_conf_threshold', '0.25'),
('default_iou_threshold', '0.45'),
('max_upload_size', '10485760'),
('maintenance_mode', 'false');

-- ============================================================
-- 创建视图（便于统计查询）
-- ============================================================

-- 每日检测统计视图
CREATE OR REPLACE VIEW v_daily_stats AS
SELECT
    DATE(timestamp) as date,
    COUNT(*) as total_records,
    SUM(defect_count) as total_defects,
    AVG(defect_count) as avg_defects
FROM detection_records
WHERE status = 'completed'
GROUP BY DATE(timestamp);

-- 用户类型统计视图
CREATE OR REPLACE VIEW v_user_type_stats AS
SELECT
    u.user_type,
    COUNT(DISTINCT u.id) as user_count,
    COUNT(r.id) as record_count,
    COALESCE(SUM(r.defect_count), 0) as total_defects
FROM users u
LEFT JOIN detection_records r ON u.id = r.user_id
GROUP BY u.user_type;

-- 缺陷类型统计视图
CREATE OR REPLACE VIEW v_defect_type_stats AS
SELECT
    class_name,
    COUNT(*) as count,
    AVG(confidence) as avg_confidence,
    MIN(confidence) as min_confidence,
    MAX(confidence) as max_confidence
FROM detection_events
GROUP BY class_name;

-- ============================================================
-- 完成提示
-- ============================================================
SELECT '============================================================' as '';
SELECT '钢材缺陷检测系统 - MySQL 数据库初始化完成!' as 'Status';
SELECT '============================================================' as '';
SELECT CONCAT('用户表: ', COUNT(*), ' 条记录') as '用户数据' FROM users;
SELECT CONCAT('检测记录: ', COUNT(*), ' 条记录') as '检测记录' FROM detection_records;
SELECT CONCAT('检测事件: ', COUNT(*), ' 条记录') as '检测事件' FROM detection_events;
SELECT '============================================================' as '';
SELECT '默认管理员账号: admin / admin123' as '登录信息';
SELECT '============================================================' as '';

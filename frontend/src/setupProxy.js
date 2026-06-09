/**
 * CRA 开发代理配置
 * Flask 后端 (端口 5000): 检测/摄像头/视频流
 * FastAPI/Django 后端 (端口 8000): 认证/管理 API
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Flask 后端路由 - 钢材检测核心功能
  const flaskRoutes = [
    '/detect_image',
    '/set_camera',
    '/stop_camera',
    '/get_camera_status',
    '/video_feed',
    '/get_detection_params',
    '/set_conf_threshold',
    '/set_iou_threshold',
    '/get_screenshot_interval',
    '/set_screenshot_interval',
    '/model_status',
    '/load_model',
    '/class_options',
    '/red_box_classes',
    '/set_red_box_classes',
    '/recent_events',
    '/analyze_with_llm',
    '/captures',
    '/captures_data',
    '/uploads',
  ];

  app.use(
    flaskRoutes,
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      ws: true,
    })
  );

  // FastAPI/Django 后端路由 - 认证与管理
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
    })
  );
};

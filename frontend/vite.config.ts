import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Flask 后端 (端口 5000) - 检测/摄像头/视频流等核心功能
      '/detect_image': { target: 'http://localhost:5000', changeOrigin: true },
      '/set_camera': { target: 'http://localhost:5000', changeOrigin: true },
      '/stop_camera': { target: 'http://localhost:5000', changeOrigin: true },
      '/get_camera_status': { target: 'http://localhost:5000', changeOrigin: true },
      '/video_feed': { target: 'http://localhost:5000', changeOrigin: true },
      '/get_detection_params': { target: 'http://localhost:5000', changeOrigin: true },
      '/set_conf_threshold': { target: 'http://localhost:5000', changeOrigin: true },
      '/set_iou_threshold': { target: 'http://localhost:5000', changeOrigin: true },
      '/get_screenshot_interval': { target: 'http://localhost:5000', changeOrigin: true },
      '/set_screenshot_interval': { target: 'http://localhost:5000', changeOrigin: true },
      '/model_status': { target: 'http://localhost:5000', changeOrigin: true },
      '/load_model': { target: 'http://localhost:5000', changeOrigin: true },
      '/class_options': { target: 'http://localhost:5000', changeOrigin: true },
      '/red_box_classes': { target: 'http://localhost:5000', changeOrigin: true },
      '/set_red_box_classes': { target: 'http://localhost:5000', changeOrigin: true },
      '/recent_events': { target: 'http://localhost:5000', changeOrigin: true },
      '/analyze_with_llm': { target: 'http://localhost:5000', changeOrigin: true },
      '/captures': { target: 'http://localhost:5000', changeOrigin: true },
      '/captures_data': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
      '/static': { target: 'http://localhost:5000', changeOrigin: true },

      // Django/FastAPI 后端 (端口 8000) - 认证/管理 API
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})

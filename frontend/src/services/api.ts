import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { message } from 'antd';

// API基础配置
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // 如果是401错误且不是刷新令牌请求
    if (error.response?.status === 401 && !originalRequest?.url?.includes('/refresh')) {
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          // 尝试刷新令牌
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token, refresh_token: newRefreshToken } = response.data;

          // 更新存储的令牌
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefreshToken);

          // 重新发送原始请求
          if (originalRequest) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            return apiClient(originalRequest);
          }
        } catch (refreshError) {
          // 刷新令牌失败，清除令牌并跳转到登录页
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        // 没有刷新令牌，跳转到登录页
        window.location.href = '/login';
      }
    }

    // 显示错误消息
    const errorMessage = (error.response?.data as any)?.detail || '请求失败，请重试';
    message.error(errorMessage);

    return Promise.reject(error);
  }
);

// 认证API
export const authAPI = {
  // 用户登录
  login: async (credentials: { username: string; password: string }) => {
    const response = await apiClient.post('/api/auth/login', credentials);
    return response.data;
  },

  // 用户注册
  register: async (userData: {
    username: string;
    password: string;
    email?: string;
    phone?: string;
    company_name?: string;
    user_type: string;
  }) => {
    const response = await apiClient.post('/api/auth/register', userData);
    return response.data;
  },

  // 获取当前用户信息
  getMe: async () => {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  },

  // 更新用户信息
  updateMe: async (userData: {
    email?: string;
    phone?: string;
    company_name?: string;
  }) => {
    const response = await apiClient.put('/api/auth/me', userData);
    return response.data;
  },

  // 刷新令牌
  refreshToken: async (refreshToken: string) => {
    const response = await apiClient.post('/api/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },
};

// 检测API
export const detectionAPI = {
  // 图片检测
  detectImage: async (file: File, confThreshold: number = 0.25, iouThreshold: number = 0.45) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conf_threshold', confThreshold.toString());
    formData.append('iou_threshold', iouThreshold.toString());

    const response = await apiClient.post('/api/detection/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 摄像头实时检测流
  getCameraStream: (cameraSource: string = '0') => {
    return `${API_BASE_URL}/api/detection/camera/stream?camera_source=${cameraSource}`;
  },

  // 摄像头捕获检测
  captureFromCamera: async (cameraSource: string = '0', confThreshold: number = 0.25, iouThreshold: number = 0.45) => {
    const response = await apiClient.post('/api/detection/camera/capture', null, {
      params: {
        camera_source: cameraSource,
        conf_threshold: confThreshold,
        iou_threshold: iouThreshold,
      },
    });
    return response.data;
  },

  // 获取模型列表
  getModels: async () => {
    const response = await apiClient.get('/api/detection/models');
    return response.data;
  },

  // 加载模型
  loadModel: async (modelName: string) => {
    const response = await apiClient.post(`/api/detection/models/${modelName}/load`);
    return response.data;
  },

  // 获取检测图片
  getImage: (imagePath: string) => {
    return `${API_BASE_URL}/api/detection/image/${imagePath}`;
  },
};

// 记录API
export const recordsAPI = {
  // 获取记录列表
  getRecords: async (limit: number = 50, offset: number = 0) => {
    const response = await apiClient.get('/api/records/', {
      params: { limit, offset },
    });
    return response.data;
  },

  // 获取记录详情
  getRecord: async (recordId: string) => {
    const response = await apiClient.get(`/api/records/${recordId}`);
    return response.data;
  },

  // 获取记录事件
  getRecordEvents: async (recordId: string) => {
    const response = await apiClient.get(`/api/records/${recordId}/events`);
    return response.data;
  },

  // 删除记录
  deleteRecord: async (recordId: string) => {
    const response = await apiClient.delete(`/api/records/${recordId}`);
    return response.data;
  },

  // 获取统计信息
  getStatistics: async () => {
    const response = await apiClient.get('/api/records/statistics/summary');
    return response.data;
  },

  // 搜索相似记录
  searchSimilar: async (query: string, limit: number = 5) => {
    const response = await apiClient.get('/api/records/search/similar', {
      params: { query, limit },
    });
    return response.data;
  },
};

// 管理员API
export const adminAPI = {
  // 获取看板数据
  getDashboard: async () => {
    const response = await apiClient.get('/api/admin/dashboard');
    return response.data;
  },

  // 获取用户列表
  getUsers: async (userType?: string, limit: number = 100, offset: number = 0) => {
    const response = await apiClient.get('/api/admin/users', {
      params: { user_type: userType, limit, offset },
    });
    return response.data;
  },

  // 获取用户详情
  getUser: async (userId: string) => {
    const response = await apiClient.get(`/api/admin/users/${userId}`);
    return response.data;
  },

  // 更新用户状态
  updateUserStatus: async (userId: string, isActive: boolean) => {
    const response = await apiClient.put(`/api/admin/users/${userId}/status`, null, {
      params: { is_active: isActive },
    });
    return response.data;
  },

  // 获取所有记录
  getAllRecords: async (userId?: string, limit: number = 100, offset: number = 0) => {
    const response = await apiClient.get('/api/admin/records', {
      params: { user_id: userId, limit, offset },
    });
    return response.data;
  },

  // 获取记录详情
  getRecord: async (recordId: string) => {
    const response = await apiClient.get(`/api/admin/records/${recordId}`);
    return response.data;
  },

  // 删除记录
  deleteRecord: async (recordId: string) => {
    const response = await apiClient.delete(`/api/admin/records/${recordId}`);
    return response.data;
  },

  // 获取记录事件
  getRecordEvents: async (recordId: string) => {
    const response = await apiClient.get(`/api/records/${recordId}/events`);
    return response.data;
  },

  // 获取用户统计
  getUserStatistics: async () => {
    const response = await apiClient.get('/api/admin/statistics/users');
    return response.data;
  },

  // 获取检测统计
  getDetectionStatistics: async (userId?: string) => {
    const response = await apiClient.get('/api/admin/statistics/detections', {
      params: { user_id: userId },
    });
    return response.data;
  },

  // 获取缺陷类型统计
  getDefectTypeStatistics: async () => {
    const response = await apiClient.get('/api/admin/statistics/defect-types');
    return response.data;
  },

  // 获取检测趋势
  getDetectionTrends: async (days: number = 30) => {
    const response = await apiClient.get('/api/admin/statistics/trends', {
      params: { days },
    });
    return response.data;
  },
};

// 系统API
export const systemAPI = {
  // 健康检查
  healthCheck: async () => {
    const response = await apiClient.get('/health');
    return response.data;
  },

  // 获取系统状态 (/api/status)
  getSystemInfo: async () => {
    const response = await apiClient.get('/api/status');
    return response.data;
  },

  // 获取模型状态 (/model_status)
  getModelStatus: async () => {
    const response = await apiClient.get('/model_status');
    return response.data;
  },
};

export default apiClient;

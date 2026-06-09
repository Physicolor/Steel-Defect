import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { message } from 'antd';
import { authAPI } from '../services/api';

// 用户类型定义
interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  company_name?: string;
  user_type: 'personal' | 'enterprise' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 认证上下文类型
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

// 注册数据类型
interface RegisterData {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  company_name?: string;
  user_type: 'personal' | 'enterprise' | 'admin';
}

// 创建认证上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 认证提供者组件
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 检查本地存储的令牌
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const userData = await authAPI.getMe();
          setUser(userData);
        } catch (error) {
          console.error('认证检查失败:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  // 登录函数
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await authAPI.login({ username, password });

      // 保存令牌
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);

      // 获取用户信息
      const userData = await authAPI.getMe();
      setUser(userData);

      message.success('登录成功');
      return true;
    } catch (error: any) {
      console.error('登录失败:', error);
      message.error(error.response?.data?.detail || '登录失败，请重试');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 注册函数
  const register = async (userData: RegisterData): Promise<boolean> => {
    try {
      setLoading(true);
      await authAPI.register(userData);
      message.success('注册成功，请登录');
      return true;
    } catch (error: any) {
      console.error('注册失败:', error);
      message.error(error.response?.data?.detail || '注册失败，请重试');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 登出函数
  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    message.success('已退出登录');
  };

  // 更新用户信息
  const updateUser = (userData: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...userData });
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 使用认证的Hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

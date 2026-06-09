import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './components/Layout/MainLayout';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Detection from './pages/Detection/Detection';
import Records from './pages/Records/Records';
import Admin from './pages/Admin/Admin';
import SteelHomePage from './pages/SteelHome/SteelHomePage';
import { AuthProvider, useAuth } from './store/AuthContext';

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user?.username !== 'admin') {
    return <Navigate to="/detection" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppRoutes />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.username === 'admin';

  if (isAdmin) {
    return (
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/detection" element={<Detection />} />
          <Route path="/records" element={<Records />} />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute adminOnly>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MainLayout>
    );
  }

  // 普通用户：直接显示钢材缺陷检测主界面（没有左侧导航栏）
  return (
    <Routes>
      <Route path="/" element={<SteelHomePage />} />
      <Route path="/detection" element={<SteelHomePage />} />
      <Route path="/*" element={<SteelHomePage />} />
    </Routes>
  );
};

export default App;

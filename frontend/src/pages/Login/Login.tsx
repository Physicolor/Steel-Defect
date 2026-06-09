import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Tabs, Select, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, BankOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';

const { Title, Text, Link } = Typography;
const { Option } = Select;

const Login: React.FC = () => {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, register } = useAuth();

  // 登录表单提交
  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const success = await login(values.username, values.password);
      if (success) {
        // 根据用户名判断跳转路径
        // 管理员（admin）跳转到首页（有侧边栏）
        // 普通用户跳转到检测页面（无侧边栏）
        if (values.username === 'admin') {
          navigate('/');
        } else {
          navigate('/detection');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // 注册表单提交
  const handleRegister = async (values: {
    username: string;
    password: string;
    confirmPassword: string;
    email?: string;
    phone?: string;
    company_name?: string;
    user_type: string;
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const success = await register({
        username: values.username,
        password: values.password,
        email: values.email,
        phone: values.phone,
        company_name: values.company_name,
        user_type: values.user_type as 'personal' | 'enterprise' | 'admin',
      });
      if (success) {
        setActiveTab('login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              钢材缺陷检测系统
            </Title>
            <Text type="secondary">基于AI的智能钢材缺陷检测平台</Text>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <Form
                    name="login"
                    onFinish={handleLogin}
                    autoComplete="off"
                    size="large"
                  >
                    <Form.Item
                      name="username"
                      rules={[{ required: true, message: '请输入用户名' }]}
                    >
                      <Input
                        prefix={<UserOutlined />}
                        placeholder="用户名"
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="密码"
                      />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                      >
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <Form
                    name="register"
                    onFinish={handleRegister}
                    autoComplete="off"
                    size="large"
                  >
                    <Form.Item
                      name="username"
                      rules={[
                        { required: true, message: '请输入用户名' },
                        { min: 3, message: '用户名至少3个字符' },
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined />}
                        placeholder="用户名"
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      rules={[
                        { required: true, message: '请输入密码' },
                        { min: 6, message: '密码至少6个字符' },
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="密码"
                      />
                    </Form.Item>

                    <Form.Item
                      name="confirmPassword"
                      rules={[
                        { required: true, message: '请确认密码' },
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="确认密码"
                      />
                    </Form.Item>

                    <Form.Item
                      name="user_type"
                      rules={[{ required: true, message: '请选择用户类型' }]}
                    >
                      <Select placeholder="选择用户类型">
                        <Option value="personal">个人用户</Option>
                        <Option value="enterprise">企业用户</Option>
                      </Select>
                    </Form.Item>

                    <Form.Item name="email">
                      <Input
                        prefix={<MailOutlined />}
                        placeholder="邮箱（可选）"
                      />
                    </Form.Item>

                    <Form.Item name="phone">
                      <Input
                        prefix={<PhoneOutlined />}
                        placeholder="手机号（可选）"
                      />
                    </Form.Item>

                    <Form.Item name="company_name">
                      <Input
                        prefix={<BankOutlined />}
                        placeholder="企业名称（企业用户必填）"
                      />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                      >
                        注册
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          <Text type="secondary" style={{ fontSize: 12 }}>
            © 2026 钢材缺陷检测系统. All rights reserved.
          </Text>
        </Space>
      </Card>
    </div>
  );
};

export default Login;

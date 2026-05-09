import { useState } from 'react'
import { FloatingWidget } from '@/components/FloatingWidget'
import { FeatureModal } from '@/components/FeatureModal'

function App() {
  const [showModelModal, setShowModelModal] = useState(false)
  const [showDatabaseModal, setShowDatabaseModal] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      {/* 页面内容 - 示例背景 */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-5xl font-bold text-foreground">
            悬浮搜索助手
          </h1>
          <p className="text-xl text-muted-foreground">
            点击右侧半圆形悬浮窗开始使用
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            <div className="p-6 rounded-xl bg-white dark:bg-gray-900 border border-border shadow-elegant">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">智能搜索</h3>
              <p className="text-sm text-muted-foreground">快速访问常用功能</p>
            </div>
            
            <div className="p-6 rounded-xl bg-white dark:bg-gray-900 border border-border shadow-elegant">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">模型管理</h3>
              <p className="text-sm text-muted-foreground">选择和配置AI模型</p>
            </div>
            
            <div className="p-6 rounded-xl bg-white dark:bg-gray-900 border border-border shadow-elegant">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">数据库</h3>
              <p className="text-sm text-muted-foreground">管理和查询数据</p>
            </div>
          </div>
        </div>
      </div>

      {/* 悬浮窗组件 */}
      <FloatingWidget
        onModelSelect={() => setShowModelModal(true)}
        onDatabaseSelect={() => setShowDatabaseModal(true)}
      />

      {/* 模型选择模态窗口 */}
      <FeatureModal
        isOpen={showModelModal}
        title="模型选择"
        onClose={() => setShowModelModal(false)}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">在这里可以选择和配置不同的AI模型。</p>
          <div className="grid grid-cols-1 gap-4">
            {['GPT-4', 'Claude', '本地模型'].map((model, index) => (
              <button
                key={index}
                className="p-4 rounded-lg border border-border hover:border-primary hover:bg-accent transition-all text-left"
              >
                <h4 className="font-semibold mb-1">{model}</h4>
                <p className="text-sm text-muted-foreground">点击选择此模型</p>
              </button>
            ))}
          </div>
        </div>
      </FeatureModal>

      {/* 数据库模态窗口 */}
      <FeatureModal
        isOpen={showDatabaseModal}
        title="数据库管理"
        onClose={() => setShowDatabaseModal(false)}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">在这里可以管理和查询数据库内容。</p>
          <div className="grid grid-cols-1 gap-4">
            {['用户数据', '产品库', '日志记录'].map((db, index) => (
              <button
                key={index}
                className="p-4 rounded-lg border border-border hover:border-primary hover:bg-accent transition-all text-left"
              >
                <h4 className="font-semibold mb-1">{db}</h4>
                <p className="text-sm text-muted-foreground">点击查看数据库详情</p>
              </button>
            ))}
          </div>
        </div>
      </FeatureModal>
    </div>
  )
}

export default App

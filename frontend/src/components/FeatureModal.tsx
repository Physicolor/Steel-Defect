import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeatureModalProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children?: React.ReactNode
}

export function FeatureModal({ isOpen, title, onClose, children }: FeatureModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 模态窗口 */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-elegant border border-border animate-slide-up">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* 内容区域 */}
        <div className="p-6 min-h-[300px]">
          {children || (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>功能开发中...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

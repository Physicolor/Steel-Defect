import { useState, useEffect, useRef } from 'react'
import { Search, Database, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingWidgetProps {
  onModelSelect?: () => void
  onDatabaseSelect?: () => void
}

type WidgetState = 'docked' | 'centered' | 'expanded'
type HoverZone = 'none' | 'top' | 'bottom'

export function FloatingWidget({ onModelSelect, onDatabaseSelect }: FloatingWidgetProps) {
  const [state, setState] = useState<WidgetState>('docked')
  const [hoverZone, setHoverZone] = useState<HoverZone>('none')
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight / 2 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const widgetRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 监听鼠标移动，实现拖拽功能
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x
        const newY = e.clientY - dragOffset.y
        
        // 限制在屏幕范围内
        const maxX = window.innerWidth - 60
        const maxY = window.innerHeight - 60
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  // 自动吸附到边缘
  useEffect(() => {
    if (!isDragging && state === 'docked') {
      const threshold = window.innerWidth / 2
      const targetX = position.x > threshold ? window.innerWidth - 30 : 0
      
      // 平滑过渡到边缘
      const animate = () => {
        setPosition(prev => {
          const diff = targetX - prev.x
          if (Math.abs(diff) < 1) {
            return { ...prev, x: targetX }
          }
          return { ...prev, x: prev.x + diff * 0.15 }
        })
        
        if (Math.abs(targetX - position.x) > 1) {
          requestAnimationFrame(animate)
        }
      }
      
      requestAnimationFrame(animate)
    }
  }, [isDragging, state, position.x])

  // 点击时居中展开
  const handleClick = () => {
    if (state === 'docked') {
      setState('centered')
      setPosition({
        x: window.innerWidth / 2 - 240,
        y: window.innerHeight / 2 - 32
      })
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 400)
    }
  }

  // 关闭搜索模式
  const handleClose = () => {
    setState('docked')
    // 回到最近的边缘
    const targetX = position.x > window.innerWidth / 2 ? window.innerWidth - 30 : 0
    setPosition({
      x: targetX,
      y: Math.min(position.y, window.innerHeight - 60)
    })
  }

  // 处理悬停区域
  const handleMouseEnter = (zone: HoverZone) => {
    if (state === 'docked') {
      setHoverZone(zone)
    }
  }

  const handleMouseLeave = () => {
    setHoverZone('none')
  }

  const isOnRightEdge = position.x > window.innerWidth / 2

  return (
    <>
      {/* 主悬浮窗 */}
      <div
        ref={widgetRef}
        className={cn(
          'fixed z-50 cursor-pointer transition-all duration-500 ease-out',
          state === 'docked' ? 'w-[60px] h-[60px]' : 'w-[480px] h-[64px]'
        )}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: state === 'docked' ? 'translateY(-50%)' : 'none',
        }}
        onClick={handleClick}
      >
        {/* 半圆形/胶囊形容器 */}
        <div
          className={cn(
            'relative w-full h-full transition-all duration-500',
            state === 'docked' 
              ? 'rounded-l-full bg-gradient-to-br from-primary to-primary-glow shadow-elegant hover:shadow-glow animate-pulse-glow'
              : 'rounded-full bg-white dark:bg-gray-900 shadow-elegant border border-border'
          )}
          onMouseDown={(e) => {
            if (state === 'docked') {
              setIsDragging(true)
              setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
              })
            }
          }}
        >
          {/* Docked 状态 - 半圆图标 */}
          {state === 'docked' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 text-white opacity-80">
                {/* Logo 占位符 - 后续补充 */}
                <div className="w-full h-full rounded-full bg-white/20 backdrop-blur-sm" />
              </div>
              
              {/* 悬停检测区域 - 上半圆 */}
              <div
                className={cn(
                  'absolute top-0 left-0 w-full h-1/2 cursor-pointer',
                  isOnRightEdge ? 'rounded-l-full' : 'rounded-r-full'
                )}
                onMouseEnter={() => handleMouseEnter('top')}
                onMouseLeave={handleMouseLeave}
              />
              
              {/* 悬停检测区域 - 下半圆 */}
              <div
                className={cn(
                  'absolute bottom-0 left-0 w-full h-1/2 cursor-pointer',
                  isOnRightEdge ? 'rounded-l-full' : 'rounded-r-full'
                )}
                onMouseEnter={() => handleMouseEnter('bottom')}
                onMouseLeave={handleMouseLeave}
              />
            </div>
          )}

          {/* Centered 状态 - 搜索框 */}
          {state === 'centered' && (
            <div className="flex items-center h-full px-4 gap-3">
              {/* 搜索输入框 */}
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索..."
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-base"
                onClick={(e) => e.stopPropagation()}
              />
              
              {/* 搜索按钮 */}
              <button
                className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white hover:scale-110 transition-transform duration-200 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation()
                  // TODO: 执行搜索
                }}
              >
                <Search className="w-5 h-5" />
              </button>
              
              {/* 关闭按钮 */}
              <button
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose()
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* 功能胶囊按钮 - 仅在 centered 状态显示 */}
        {state === 'centered' && (
          <div className="absolute top-full left-0 right-0 mt-4 flex justify-center gap-3 animate-slide-up">
            <button
              className="px-4 py-2 rounded-full bg-white dark:bg-gray-900 border border-border shadow-elegant hover:border-primary hover:shadow-glow transition-all duration-200 flex items-center gap-2 text-sm font-medium"
              onClick={(e) => {
                e.stopPropagation()
                onModelSelect?.()
              }}
            >
              <Cpu className="w-4 h-4 text-primary" />
              <span>模型选择</span>
            </button>
            
            <button
              className="px-4 py-2 rounded-full bg-white dark:bg-gray-900 border border-border shadow-elegant hover:border-primary hover:shadow-glow transition-all duration-200 flex items-center gap-2 text-sm font-medium"
              onClick={(e) => {
                e.stopPropagation()
                onDatabaseSelect?.()
              }}
            >
              <Database className="w-4 h-4 text-primary" />
              <span>数据库</span>
            </button>
          </div>
        )}
      </div>

      {/* 悬停弹出面板 - 模型选择 */}
      {state === 'docked' && hoverZone === 'top' && (
        <div
          className={cn(
            'fixed z-40 w-64 glass-effect rounded-xl shadow-elegant p-4 animate-slide-up',
            isOnRightEdge ? 'right-[70px]' : 'left-[70px]'
          )}
          style={{
            top: `${position.y - 120}px`,
          }}
          onMouseLeave={handleMouseLeave}
        >
          <h3 className="text-sm font-semibold mb-3 text-foreground">模型选择</h3>
          <div className="space-y-2">
            {['选项1', '选项2', '选项3'].map((option, index) => (
              <button
                key={index}
                className="w-full px-3 py-2 rounded-lg bg-secondary hover:bg-accent text-left text-sm transition-colors"
                onClick={() => {
                  // TODO: 选择模型
                  handleMouseLeave()
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 悬停弹出面板 - 数据库 */}
      {state === 'docked' && hoverZone === 'bottom' && (
        <div
          className={cn(
            'fixed z-40 w-64 glass-effect rounded-xl shadow-elegant p-4 animate-slide-up',
            isOnRightEdge ? 'right-[70px]' : 'left-[70px]'
          )}
          style={{
            top: `${position.y + 20}px`,
          }}
          onMouseLeave={handleMouseLeave}
        >
          <h3 className="text-sm font-semibold mb-3 text-foreground">数据库</h3>
          <div className="space-y-2">
            {['选项1', '选项2', '选项3'].map((option, index) => (
              <button
                key={index}
                className="w-full px-3 py-2 rounded-lg bg-secondary hover:bg-accent text-left text-sm transition-colors"
                onClick={() => {
                  // TODO: 选择数据库
                  handleMouseLeave()
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

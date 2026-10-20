import { Crosshair, PaintBucket, Type } from 'lucide-react';
import { WIDTH, HEIGHT, type DrawingCursor as Cursor } from '../shared/types';

export function DrawingCursor({ cursor }: { cursor: Cursor }) {
  const Icon = cursor.tool === 'fill' ? PaintBucket : cursor.tool === 'text' ? Type : Crosshair;
  return <div className={`drawing-cursor ${cursor.drawing ? 'is-drawing' : ''}`} aria-hidden="true"
    data-tool={cursor.tool} data-color={cursor.color}
    style={{ left: `${cursor.point.x / WIDTH * 100}%`, top: `${cursor.point.y / HEIGHT * 100}%`, color: cursor.color,
      ...(cursor.tool === 'eraser' ? { width: `${cursor.size / WIDTH * 100}%`, height: `${cursor.size / HEIGHT * 100}%` } : {}) }}>
    {cursor.tool === 'eraser' ? null : cursor.tool === 'brush' ? <>
      {cursor.drawing && <span className="pencil-contact" />}
      <svg className="pencil-cursor-icon" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#302b3c" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M7 40 11 27 32 6 42 16 21 37Z" fill={cursor.color} />
        <path d="M7 40 11 27 21 37Z" fill="#f0d0a4" />
        <path d="m7 40 1.7-5.7 4 4Z" fill={cursor.color} strokeWidth="1" />
        <path d="m32 6 3-3q2-2 4 0l6 6q2 2 0 4l-3 3Z" fill="#edb1c1" />
        <path d="m14 29 20-20" stroke="#ffffff" strokeOpacity=".5" strokeWidth="2.5" />
      </svg>
    </> : <span className="tool-cursor-icon"><Icon size={24} strokeWidth={2} /></span>}
  </div>;
}

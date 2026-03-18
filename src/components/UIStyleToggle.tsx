import { useUIStyle } from '../contexts/UIStyleContext';

export default function UIStyleToggle() {
  const { uiStyle, toggleUIStyle } = useUIStyle();

  const isGenZ = uiStyle === 'genz';

  return (
    <div
      style={{
        position: 'fixed',
        right: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
      }}
    >
      {/* Card wrapper */}
      <div
        style={{
          background: isGenZ
            ? 'linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #f0f4ff 100%)',
          border: isGenZ
            ? '1.5px solid rgba(180, 0, 255, 0.5)'
            : '1.5px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '20px',
          padding: '12px 10px',
          boxShadow: isGenZ
            ? '0 0 20px rgba(180, 0, 255, 0.35), 0 4px 20px rgba(0,0,0,0.5)'
            : '0 4px 20px rgba(99, 102, 241, 0.2), 0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          cursor: 'pointer',
        }}
        onClick={toggleUIStyle}
        title={`Switch to ${isGenZ ? 'Millennial' : 'Gen Z'} mode`}
      >
        {/* Top label */}
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isGenZ ? 'rgba(255,255,255,0.4)' : 'rgba(100,116,139,0.6)',
          }}
        >
          {isGenZ ? '🔮 GEN Z' : '🌟 MILLENNIAL'}
        </span>

        {/* Toggle pill */}
        <div
          style={{
            width: '36px',
            height: '68px',
            borderRadius: '18px',
            background: isGenZ
              ? 'linear-gradient(180deg, #2d0060 0%, #0d0d1f 100%)'
              : 'linear-gradient(180deg, #e0e7ff 0%, #c7d2fe 100%)',
            border: isGenZ
              ? '1.5px solid rgba(180,0,255,0.4)'
              : '1.5px solid rgba(99,102,241,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: isGenZ ? 'flex-start' : 'flex-end',
            padding: '3px',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Glow line inside track */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: '1px',
              background: isGenZ
                ? 'rgba(180,0,255,0.2)'
                : 'rgba(99,102,241,0.15)',
              transform: 'translateX(-50%)',
            }}
          />

          {/* Thumb */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: isGenZ
                ? 'linear-gradient(135deg, #b400ff, #5500ff)'
                : 'linear-gradient(135deg, #6366f1, #818cf8)',
              boxShadow: isGenZ
                ? '0 0 12px rgba(180,0,255,0.8), 0 0 4px rgba(85,0,255,0.6)'
                : '0 2px 8px rgba(99,102,241,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              position: 'relative',
              zIndex: 2,
            }}
          >
            {isGenZ ? '⚡' : '✨'}
          </div>
        </div>

        {/* Bottom label — the "other" mode */}
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isGenZ
              ? 'rgba(180,0,255,0.8)'
              : 'rgba(99,102,241,0.9)',
          }}
        >
          {isGenZ ? 'MILLENNIAL' : 'GEN Z'}
        </span>
      </div>

      {/* Active mode badge */}
      <div
        style={{
          background: isGenZ
            ? 'linear-gradient(135deg, #b400ff, #5500ff)'
            : 'linear-gradient(135deg, #6366f1, #818cf8)',
          borderRadius: '10px',
          padding: '4px 8px',
          fontSize: '9px',
          fontWeight: 800,
          letterSpacing: '0.1em',
          color: '#fff',
          boxShadow: isGenZ
            ? '0 0 10px rgba(180,0,255,0.6)'
            : '0 2px 8px rgba(99,102,241,0.4)',
          transition: 'all 0.4s ease',
        }}
      >
        {isGenZ ? 'NO CAP 🔥' : 'ON FLEEK 💅'}
      </div>
    </div>
  );
}

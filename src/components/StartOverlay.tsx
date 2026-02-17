import { useState } from 'react';
import { unlockAudioContext } from '@/utils/helpers';

const StartOverlay = () => {
  const [visible, setVisible] = useState(true);

  const handleClick = async () => {
    await unlockAudioContext();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.8)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'white',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'opacity 0.5s',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>Click to Start</div>
      <div style={{ fontSize: '1rem', opacity: 0.8 }}>Enables audio and interaction</div>
    </div>
  );
};

export default StartOverlay;

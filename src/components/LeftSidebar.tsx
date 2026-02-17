import { useApp } from '@/contexts/AppContext';

interface IconButtonProps {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

const IconButton = ({ title, onClick, children }: IconButtonProps) => (
  <button className="icon-btn" title={title} onClick={onClick}>
    {children}
  </button>
);

const LeftSidebar = () => {
  const { toggleAnimation } = useApp();

  return (
    <div id="left-sidebar">
      <img src="/media/dtcc_logo.png" alt="DTCC" className="sidebar-logo logo-top" />

      <div className="icon-controls icon-controls-top">
        <IconButton title="CFD Wind Simulation" onClick={() => toggleAnimation('cfd-simulation')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
            <path d="M2 12h20M7 8h15M7 16h15"/>
          </svg>
        </IconButton>

        <IconButton title="Stormwater Flow" onClick={() => toggleAnimation('stormwater')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            <path d="M12 2v10"/>
            <circle cx="12" cy="16" r="1" fill="currentColor"/>
            <circle cx="9" cy="19" r="1" fill="currentColor"/>
            <circle cx="15" cy="19" r="1" fill="currentColor"/>
          </svg>
        </IconButton>

        <IconButton title="Slideshow" onClick={() => toggleAnimation('slideshow')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
            <polygon points="10,8 10,14 15,11" fill="currentColor"/>
          </svg>
        </IconButton>
      </div>

      <div className="sidebar-title">ACE MR Studio</div>

      <div className="icon-controls icon-controls-bottom">
        <IconButton title="Play Grid Animation" onClick={() => toggleAnimation('grid-animation')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
        </IconButton>

        <IconButton title="Interactive Isovist" onClick={() => toggleAnimation('isovist')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2 L19 9 L19 15 L12 22 L5 15 L5 9 Z"/>
            <line x1="12" y1="12" x2="12" y2="6"/>
          </svg>
        </IconButton>

        <IconButton title="FCC VR Demo" onClick={() => toggleAnimation('fcc-demo')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="14" rx="2"/>
            <polygon points="10,8 10,14 15,11" fill="currentColor"/>
            <path d="M6 20h12"/>
            <path d="M12 18v2"/>
          </svg>
        </IconButton>

        <IconButton title="Google Street View" onClick={() => toggleAnimation('street-view')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="3"/>
            <path d="M12 11v5"/>
            <circle cx="12" cy="20" r="2"/>
            <path d="M5 12c0-3.9 3.1-7 7-7s7 3.1 7 7"/>
          </svg>
        </IconButton>

        <IconButton title="Bird Sounds" onClick={() => toggleAnimation('bird-sounds')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M21 5c-1.1 0.9-2.3 1.5-3.6 1.7 1.3-0.8 2.3-2 2.7-3.5-1.2 0.7-2.5 1.2-3.9 1.5-1.1-1.2-2.7-1.9-4.5-1.9-3.4 0-6.1 2.7-6.1 6.1 0 0.5 0.1 0.9 0.2 1.4-5.1-0.3-9.6-2.7-12.6-6.4-0.5 0.9-0.8 2-0.8 3.2 0 2.1 1.1 4 2.7 5.1-1 0-2-0.3-2.8-0.8 0 0 0 0.1 0 0.1 0 3 2.1 5.5 4.9 6.1-0.5 0.1-1 0.2-1.6 0.2-0.4 0-0.8 0-1.2-0.1 0.8 2.4 3.1 4.2 5.8 4.2-2.1 1.6-4.7 2.6-7.6 2.6-0.5 0-1 0-1.5-0.1 2.7 1.7 5.9 2.7 9.4 2.7 11.3 0 17.4-9.3 17.4-17.4 0-0.3 0-0.5 0-0.8 1.2-0.9 2.2-1.9 3-3.2z"/>
          </svg>
        </IconButton>
      </div>

      <img src="/media/chalmers_logo.png" alt="Chalmers" className="sidebar-logo logo-bottom" />
    </div>
  );
};

export default LeftSidebar;

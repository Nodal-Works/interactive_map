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

const RightSidebar = () => {
  const { toggleAnimation, setBasemap, currentBasemap } = useApp();

  const handleBasemapToggle = () => {
    const basemaps = ['osm', 'cartoPositron', 'cartoDark', 'esriSatellite', 'openTopo'] as const;
    const currentIndex = basemaps.indexOf(currentBasemap);
    const nextIndex = (currentIndex + 1) % basemaps.length;
    setBasemap(basemaps[nextIndex]);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div id="right-sidebar">
      <img src="/media/chalmers_logo.png" alt="Chalmers" className="sidebar-logo logo-top" />

      <div className="icon-controls icon-controls-top">
        <IconButton title="Sun Study" onClick={() => toggleAnimation('sun-study')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </IconButton>

        <IconButton title="Switch Basemap" onClick={handleBasemapToggle}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/>
            <path d="M3 7l9-4 9 4M12 3v18"/>
            <path d="M7 10l5 3 5-3"/>
          </svg>
        </IconButton>
      </div>

      <div className="sidebar-title">ACE MR Studio</div>

      <div className="icon-controls icon-controls-bottom">
        <IconButton title="Fullscreen" onClick={handleFullscreen}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </IconButton>
      </div>

      <img src="/media/dtcc_logo.png" alt="DTCC" className="sidebar-logo logo-bottom" />
    </div>
  );
};

export default RightSidebar;

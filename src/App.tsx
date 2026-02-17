import { AppProvider } from './contexts/AppContext';
import MapComponent from './components/Map';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import StartOverlay from './components/StartOverlay';
import GridAnimation from './animations/GridAnimation';
import './App.css';

function App() {
  return (
    <AppProvider>
      <div className="app-container">
        <StartOverlay />
        <LeftSidebar />
        <RightSidebar />
        <MapComponent />
        
        {/* Canvas elements for animations */}
        <canvas id="grid-animation-canvas" style={{ display: 'none' }} />
        <canvas id="cfd-simulation-canvas" style={{ display: 'none' }} />
        <canvas id="stormwater-canvas" style={{ display: 'none' }} />
        <canvas id="slideshow-canvas" style={{ display: 'none' }} />
        <canvas id="bird-sounds-canvas" style={{ display: 'none' }} />
        
        {/* Overlay elements */}
        <div id="slideshow-metadata" className="slideshow-metadata bottom-right" />
        <div id="table-overlay" aria-hidden="true" />
        <div id="laser-pointer" />
        
        {/* Toast container */}
        <div id="toast-container" />
        
        {/* Animation Components */}
        <GridAnimation />
        {/* Other animations will be added here */}
        
        {/* Controller Link */}
        <div style={{
          position: 'fixed',
          bottom: '10px',
          right: '70px',
          zIndex: 2000,
        }}>
          <a 
            href="/controller.html" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              color: '#333',
              background: 'rgba(255,255,255,0.8)',
              padding: '5px 10px',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
            }}
          >
            Open Controller
          </a>
        </div>
      </div>
    </AppProvider>
  );
}

export default App;

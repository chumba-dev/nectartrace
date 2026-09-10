import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:5000/api/health')
      .then(res => setHealth(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-amber-800">
          🍯 NectarTrace
        </h1>
        <p className="mt-4 text-amber-700">
          Fair-Trade Honey Sourcing for Baringo County
        </p>
        {health ? (
          <div className="mt-8 p-4 bg-green-100 rounded-lg">
            <p className="text-green-800">✅ Backend connected</p>
            <p className="text-sm text-green-600">{health.timestamp}</p>
          </div>
        ) : (
          <div className="mt-8 p-4 bg-yellow-100 rounded-lg">
            <p className="text-yellow-800">⏳ Connecting to backend...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
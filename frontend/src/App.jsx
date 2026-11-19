import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Marketplace from './pages/Marketplace';
import Verify from './pages/Verify';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import ListingDetail from './pages/ListingDetail';
import Orders from './pages/Orders';
import NotFound from './pages/NotFound';
import Admin from './pages/Admin';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="*" element={<NotFound />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['COOPERATIVE_STAFF', 'ADMIN']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute
                allowedRoles={['BUYER', 'COOPERATIVE_STAFF', 'ADMIN']}
              >
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

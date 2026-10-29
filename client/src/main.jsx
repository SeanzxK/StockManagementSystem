import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, ToastProvider, useAuth } from './lib';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { PoList, PoForm, PoDetail } from './pages/PurchaseOrders';
import { StockWarehouse, StockByPo, Ledger } from './pages/Stock';
import { BastList, BastForm, BastDetail } from './pages/Bast';
import { DoList, DoForm, DoDetail } from './pages/DeliveryOrders';
import { InvoiceList, InvoiceForm, InvoiceDetail } from './pages/Invoices';
import { Products, UsersPage, SettingsPage } from './pages/Admin';

function Guard({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  if (user === undefined) return <div className="loading" style={{ paddingTop: '40vh' }}>Memuat…</div>;
  if (!user) {
    return <Routes><Route path="*" element={<Login />} /></Routes>;
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="po" element={<PoList />} />
        <Route path="po/baru" element={<Guard roles={['admin']}><PoForm /></Guard>} />
        <Route path="po/:id/edit" element={<Guard roles={['admin']}><PoForm /></Guard>} />
        <Route path="po/:id" element={<PoDetail />} />
        <Route path="stok/gudang" element={<StockWarehouse />} />
        <Route path="stok/produksi" element={<StockByPo location="production" />} />
        <Route path="stok/delivery" element={<StockByPo location="delivery" />} />
        <Route path="riwayat" element={<Ledger />} />
        <Route path="bast" element={<BastList />} />
        <Route path="bast/baru" element={<BastForm />} />
        <Route path="bast/:id" element={<BastDetail />} />
        <Route path="do" element={<Guard roles={['admin', 'delivery']}><DoList /></Guard>} />
        <Route path="do/baru" element={<Guard roles={['admin', 'delivery']}><DoForm /></Guard>} />
        <Route path="do/:id" element={<DoDetail />} />
        <Route path="do/:id/edit" element={<Guard roles={['admin', 'delivery']}><DoForm /></Guard>} />
        <Route path="invoice" element={<Guard roles={['admin']}><InvoiceList /></Guard>} />
        <Route path="invoice/baru" element={<Guard roles={['admin']}><InvoiceForm /></Guard>} />
        <Route path="invoice/:id" element={<Guard roles={['admin']}><InvoiceDetail /></Guard>} />
        <Route path="invoice/:id/edit" element={<Guard roles={['admin']}><InvoiceForm /></Guard>} />
        <Route path="barang" element={<Guard roles={['admin', 'warehouse']}><Products /></Guard>} />
        <Route path="pengguna" element={<Guard roles={['admin']}><UsersPage /></Guard>} />
        <Route path="pengaturan" element={<Guard roles={['admin']}><SettingsPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

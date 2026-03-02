import { useState, useEffect } from 'react';
import axios from 'axios';
import { Cloud, Server, Plus, Trash2, Cpu, HardDrive, Activity, RefreshCw } from 'lucide-react';

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function App() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    vcpu: 2,
    ram_mb: 1024,
    image: 'alpine'
  });

  // Load instances when the dashboard opens
  useEffect(() => {
    fetchInstances();
  }, []);

  const fetchInstances = async () => {
    setRefreshing(true);
    try {
      // In a full implementation, this would call GET /api/v1/instances
      // For the hackathon MVP, we synchronize state locally if the endpoint is missing
      console.log("Fetching latest infrastructure state...");
      // Mocking network delay
      setTimeout(() => setRefreshing(false), 500);
    } catch (error) {
      console.error("Failed to fetch instances", error);
      setRefreshing(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateInstance = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = {
        tenant_id: TENANT_ID,
        name: formData.name || `vm-${Math.floor(Math.random() * 10000)}`,
        vcpu: parseInt(formData.vcpu),
        ram_mb: parseInt(formData.ram_mb),
        image: formData.image
      };

      const response = await axios.post('/api/v1/instances', payload);

      if (response.data) {
        setInstances(prev => [...prev, {
          ...payload,
          id: response.data.id || Math.random().toString(36).substr(2, 9),
          status: response.data.status || 'RUNNING',
          ip_address: response.data.ip_address || '172.18.0.' + Math.floor(Math.random() * 100 + 2)
        }]);
        setFormData({ name: '', vcpu: 2, ram_mb: 1024, image: 'alpine' });
      }
    } catch (error) {
      alert("Quota exceeded or deployment failed. Check infrastructure logs.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (idToRemove) => {
    // In production: await axios.delete(`/api/v1/instances/${idToRemove}`);
    setInstances(prev => prev.filter(instance => instance.id !== idToRemove));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <Cloud className="w-6 h-6 text-blue-400 mr-3" />
          <span className="text-white font-bold text-lg tracking-wide">NexusCloud IaaS</span>
        </div>
        <nav className="flex-1 py-6 px-3 space-y-1">
          <a href="#" className="flex items-center px-3 py-2.5 bg-blue-600/10 text-blue-400 rounded-lg">
            <Server className="w-5 h-5 mr-3" />
            Compute Instances
          </a>
          <a href="#" className="flex items-center px-3 py-2.5 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
            <Activity className="w-5 h-5 mr-3" />
            Monitoring
          </a>
          <a href="#" className="flex items-center px-3 py-2.5 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
            <HardDrive className="w-5 h-5 mr-3" />
            Block Storage
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admin Panel</div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              ST
            </div>
            <div>
              <div className="text-sm text-white font-medium">System Admin</div>
              <div className="text-xs text-slate-400">Tenant: {TENANT_ID.substring(0,8)}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white h-16 flex items-center justify-between px-8 border-b border-slate-200">
          <h1 className="text-xl font-semibold text-slate-800">Virtual Machines</h1>
          <button onClick={fetchInstances} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          
          {/* Quota Overview Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center mr-4">
                <Server className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500">Active Instances</div>
                <div className="text-2xl font-bold text-slate-800">{instances.length} / 10</div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center mr-4">
                <Cpu className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500">Allocated vCPUs</div>
                <div className="text-2xl font-bold text-slate-800">
                  {instances.reduce((acc, curr) => acc + curr.vcpu, 0)} / 20
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center mr-4">
                <HardDrive className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500">RAM Usage (MB)</div>
                <div className="text-2xl font-bold text-slate-800">
                  {instances.reduce((acc, curr) => acc + curr.ram_mb, 0)} / 16384
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Provisioning Form */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
              <h2 className="text-lg font-semibold text-slate-800 mb-5 flex items-center">
                <Plus className="w-5 h-5 mr-2 text-blue-600" />
                Deploy Instance
              </h2>
              <form onSubmit={handleCreateInstance} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Hostname</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" placeholder="e.g. prod-web-node" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Image / Marketplace</label>
                  <select name="image" value={formData.image} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm bg-white">
                    <option value="alpine">Alpine Linux 3.19 (Minimal)</option>
                    <option value="ubuntu">Ubuntu Server 22.04 LTS</option>
                    <option value="nginx">Nginx 1.25 (1-Click App)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Compute (vCPU)</label>
                    <input type="number" name="vcpu" value={formData.vcpu} onChange={handleInputChange} min="1" max="8" className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Memory (MB)</label>
                    <input type="number" name="ram_mb" value={formData.ram_mb} onChange={handleInputChange} step="512" min="512" max="8192" className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors mt-2 flex justify-center items-center disabled:bg-blue-400">
                  {loading ? (
                    <span className="flex items-center"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Provisioning...</span>
                  ) : 'Launch Instance'}
                </button>
              </form>
            </div>

            {/* Infrastructure Table */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800">Infrastructure Pipeline</h2>
              </div>
              
              {instances.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                    <Cloud className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-700 mb-1">No instances found</h3>
                  <p className="text-slate-500 text-sm max-w-sm">Your infrastructure is empty. Deploy your first virtual machine using the provisioning panel.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Instance</th>
                        <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Image</th>
                        <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Resources</th>
                        <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {instances.map((instance) => (
                        <tr key={instance.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="py-4 px-6">
                            <div className="font-medium text-slate-800">{instance.name}</div>
                            <div className="text-xs font-mono text-slate-500 mt-0.5">{instance.ip_address}</div>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600 capitalize">
                            {instance.image}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {instance.vcpu} vCPU <span className="text-slate-300 mx-1">|</span> {instance.ram_mb} MB
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                              {instance.status}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button 
                              onClick={() => handleDelete(instance.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100"
                              title="Terminate Instance"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
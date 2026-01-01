import { useState, useEffect, useRef } from 'react';
import { Copy, Check, Gift, Download, Package, Sparkles, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface PromoCode {
  id: string;
  code: string;
  packType: 'starter' | 'professional';
  discountAmount: number;
  generatedFor: string;
  expiresAt: string;
  usageLimit: number;
  usedCount: number;
  status: 'active' | 'used' | 'expired';
}

const PromoCodeGenerator = () => {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [packType, setPackType] = useState<'starter' | 'professional'>('starter');
  const [quantity, setQuantity] = useState(1);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usedCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadUserProfile();
    loadPromoCodes();
  }, [user]);

  async function loadUserProfile() {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.display_name) {
        setUsername(data.display_name);
      } else {
        setUsername(user.email?.split('@')[0] || 'user');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      setUsername(user.email?.split('@')[0] || 'user');
    }
  }

  async function loadPromoCodes() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedCodes: PromoCode[] = data.map(code => ({
          id: code.id,
          code: code.code,
          packType: code.pack_type as 'starter' | 'professional',
          discountAmount: code.discount_amount,
          generatedFor: code.generated_for,
          expiresAt: code.expires_at,
          usageLimit: code.usage_limit,
          usedCount: code.used_count,
          status: code.status as 'active' | 'used' | 'expired',
        }));

        setPromoCodes(formattedCodes);

        formattedCodes.forEach(code => {
          const suffix = code.code.slice(username.length);
          usedCodesRef.current.add(suffix);
        });
      }
    } catch (error) {
      console.error('Error loading promo codes:', error);
    }
  }

  const generateUniqueCode = (length: number): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let attempts = 0;
    let code = '';

    do {
      code = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        code += chars[randomIndex];
      }
      attempts++;

      if (attempts > 100) {
        code += Date.now().toString().slice(-3);
        break;
      }
    } while (usedCodesRef.current.has(code));

    usedCodesRef.current.add(code);
    return code;
  };

  const generatePromoCode = (): PromoCode => {
    const isStarter = packType === 'starter';
    const codeLength = isStarter ? 3 : 5;
    const uniqueCode = generateUniqueCode(codeLength);
    const discountAmount = isStarter ? 0 : 399;

    const code = `${username.toUpperCase()}${uniqueCode}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return {
      id: `promo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      code,
      packType,
      discountAmount,
      generatedFor: username,
      expiresAt: expiresAt.toISOString(),
      usageLimit: 1,
      usedCount: 0,
      status: 'active'
    };
  };

  const generatePromoCodes = async () => {
    if (!user || !username) {
      alert('Please wait for user profile to load');
      return;
    }

    setLoading(true);

    try {
      const newCodes: PromoCode[] = [];

      for (let i = 0; i < quantity; i++) {
        newCodes.push(generatePromoCode());
      }

      const dbCodes = newCodes.map(code => ({
        code: code.code,
        user_id: user.id,
        pack_type: code.packType,
        discount_amount: code.discountAmount,
        generated_for: code.generatedFor,
        expires_at: code.expiresAt,
        usage_limit: code.usageLimit,
        used_count: code.usedCount,
        status: code.status,
      }));

      const { error } = await supabase
        .from('promo_codes')
        .insert(dbCodes);

      if (error) throw error;

      setPromoCodes(prev => [...newCodes, ...prev]);
    } catch (error) {
      console.error('Error generating promo codes:', error);
      alert('Failed to generate promo codes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getPackDetails = (type: 'starter' | 'professional') => {
    return type === 'starter'
      ? { name: 'Starter Pack', originalPrice: 0, finalPrice: 0, savings: 0 }
      : { name: 'Professional Pack', originalPrice: 499, finalPrice: 100, savings: 399 };
  };

  const downloadAsCSV = () => {
    const headers = ['Code', 'Pack Type', 'Original Price', 'Final Price', 'Savings', 'For Username', 'Expires On', 'Status'];
    const csvData = promoCodes.map(code => {
      const pack = getPackDetails(code.packType);
      return [
        code.code,
        code.packType.toUpperCase(),
        code.discountAmount === 0 ? 'FREE' : `₹${pack.originalPrice}`,
        code.discountAmount === 0 ? 'FREE' : `₹${pack.finalPrice}`,
        code.discountAmount === 0 ? 'FREE' : `₹${code.discountAmount}`,
        code.generatedFor,
        formatDate(code.expiresAt),
        code.status.toUpperCase()
      ];
    });

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `promo-codes-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
            <Gift className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Promo Code Generator</h2>
            <p className="text-sm text-gray-600">Create unique discount codes for your customers</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Select Pack Type</label>
            <div className="grid grid-cols-2 gap-4">
              {(['starter', 'professional'] as const).map((type) => {
                const pack = getPackDetails(type);
                const isSelected = packType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setPackType(type)}
                    className={`relative p-5 rounded-xl border-2 transition-all duration-200 ${
                      isSelected
                        ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-md scale-105'
                        : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-sm'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="flex flex-col items-center text-center space-y-2">
                      <Package className={`w-8 h-8 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                      <div>
                        <div className="font-bold text-gray-900 text-sm">{pack.name}</div>
                        {type === 'starter' ? (
                          <div className="text-2xl font-bold text-green-600 mt-1">FREE</div>
                        ) : (
                          <div className="mt-1">
                            <div className="text-xs text-gray-500 line-through">₹{pack.originalPrice}</div>
                            <div className="text-2xl font-bold text-purple-600">₹{pack.finalPrice}</div>
                            <div className="text-xs text-green-600 font-semibold mt-1">Save ₹{pack.savings}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Number of Codes</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="20"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="w-16 h-12 flex items-center justify-center bg-purple-100 rounded-lg">
                <span className="text-2xl font-bold text-purple-600">{quantity}</span>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>1 code</span>
              <span>20 codes</span>
            </div>
          </div>

          <button
            onClick={generatePromoCodes}
            disabled={loading || !username}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-xl hover:shadow-xl transition-all font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            <Sparkles className={`w-5 h-5 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? 'Generating...' : `Generate ${quantity} Code${quantity > 1 ? 's' : ''}`}
          </button>
        </div>

        <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-5 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-gray-700" />
            <h3 className="font-bold text-gray-900">Code Preview</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">Format</div>
              <div className="font-mono text-lg font-bold text-gray-900">
                {username ? username.toUpperCase() : 'USERNAME'}
                <span className="text-purple-600">{packType === 'starter' ? 'XXX' : 'XXXXX'}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">Example</div>
              <div className="font-mono text-lg font-bold text-purple-600">
                {username ? `${username.toUpperCase()}${packType === 'starter' ? 'A2C' : 'A2C5X'}` : 'USERA2C'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Validity</div>
                <div className="text-sm font-bold text-gray-900">30 Days</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Usage</div>
                <div className="text-sm font-bold text-gray-900">One-time</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {promoCodes.length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Generated Codes</h3>
              <p className="text-sm text-gray-600">{promoCodes.length} total codes</p>
            </div>
            <button
              onClick={downloadAsCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {promoCodes.map((promo) => {
              const pack = getPackDetails(promo.packType);
              return (
                <div
                  key={promo.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="font-mono text-xl font-bold text-gray-900 tracking-wider">
                          {promo.code}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          promo.packType === 'starter'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {pack.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {promo.discountAmount === 0 ? (
                          <span className="font-semibold text-green-600">FREE</span>
                        ) : (
                          <span className="font-semibold">
                            <span className="text-gray-400 line-through">₹{pack.originalPrice}</span>
                            {' → '}
                            <span className="text-purple-600">₹{pack.finalPrice}</span>
                            <span className="text-green-600 ml-2">(Save ₹{promo.discountAmount})</span>
                          </span>
                        )}
                        <span>•</span>
                        <span>Expires: {formatDate(promo.expiresAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(promo.code)}
                      className={`ml-4 p-3 rounded-lg transition-colors ${
                        copiedCode === promo.code
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={copiedCode === promo.code ? 'Copied!' : 'Copy code'}
                    >
                      {copiedCode === promo.code ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {promoCodes.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center">
            <Gift className="w-8 h-8 text-purple-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No codes generated yet</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Select a pack type and quantity above, then click generate to create your first promo codes
          </p>
        </div>
      )}
    </div>
  );
};

export default PromoCodeGenerator;

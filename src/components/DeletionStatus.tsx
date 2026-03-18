import { useSearchParams } from 'react-router-dom';

export default function DeletionStatus() {
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get('id');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-6">
        {/* Logo / Brand */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-md">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800">Data Deletion Request Received</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your data deletion request has been received and is being processed.
            All personal data associated with your Instagram account has been or will be permanently deleted from our systems.
          </p>
        </div>

        {/* Status indicator */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-center gap-2 text-green-700 font-semibold text-sm">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
            Deletion request confirmed
          </div>
          {confirmationCode && (
            <p className="text-green-600 text-xs font-mono break-all">
              Confirmation ID: {confirmationCode}
            </p>
          )}
        </div>

        {/* What gets deleted */}
        <div className="text-left space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Data removed includes</p>
          <ul className="space-y-1.5">
            {[
              'Instagram account connection & tokens',
              'Automation workflows and settings',
              'Contact and follower data',
              'Activity logs and analytics',
              'All other account-related data',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-400">
          This page is publicly accessible as required by Meta Platform Policy.
          If you have questions, contact us at{' '}
          <a href="mailto:support@quickrevert.tech" className="text-blue-500 hover:underline">
            support@quickrevert.tech
          </a>
        </p>
      </div>
    </div>
  );
}

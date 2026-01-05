interface BasicInfoProps {
  name: string;
  onNameChange: (name: string) => void;
  onNext: () => void;
}

export default function BasicInfo({ name, onNameChange, onNext }: BasicInfoProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Basic Info: Name your automation</h2>
        <p className="text-gray-600">
          Give your automation a name to help you identify it later.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
            Automation Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Smart Comment Handler"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            required
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

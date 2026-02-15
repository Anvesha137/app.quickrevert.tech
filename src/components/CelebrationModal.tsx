import { useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export default function CelebrationModal() {
    const { showCelebration, closeCelebration } = useUpgradeModal();
    const firedRef = useRef(false);

    useEffect(() => {
        if (showCelebration && !firedRef.current) {
            firedRef.current = true;

            // Fire confetti!
            const duration = 3000;
            const end = Date.now() + duration;

            const frame = () => {
                // launch a few confetti from the left edge
                confetti({
                    particleCount: 2,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    zIndex: 200 // Above modal
                });
                // and launch a few from the right edge
                confetti({
                    particleCount: 2,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    zIndex: 200
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            };

            // Initial burst
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                zIndex: 200
            });

            frame();
        } else if (!showCelebration) {
            firedRef.current = false;
        }
    }, [showCelebration]);

    const handleClose = () => {
        closeCelebration();
        // Refresh to update limits and user status
        window.location.reload();
    };

    if (!showCelebration) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-300 relative text-center">

                {/* Header Decoration */}
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 h-32 relative flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                    <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>

                    <div className="bg-white p-4 rounded-full shadow-xl relative z-10 animate-in zoom-in duration-500 delay-100">
                        <Sparkles className="w-12 h-12 text-violet-600" />
                    </div>
                </div>

                <div className="px-8 pt-8 pb-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Premium!</h2>
                    <p className="text-gray-600 mb-8 max-w-xs mx-auto">
                        You've confirmed your subscription. Get ready for unlimited automation power.
                    </p>

                    <div className="bg-green-50 rounded-xl p-4 mb-8 border border-green-100 flex items-start text-left gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-green-800">
                            <p className="font-semibold mb-1">Upgrade Successful</p>
                            <p>Your features are unlocked and ready to use immediately.</p>
                        </div>
                    </div>

                    <button
                        onClick={handleClose}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white text-lg font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Let's Get Started
                    </button>
                </div>
            </div>
        </div>
    );
}

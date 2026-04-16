import { createContext, useContext, useState, ReactNode } from 'react';
import { useSubscription, PlanId } from './SubscriptionContext';

interface UpgradeModalContextType {
    isOpen: boolean;
    defaultBillingCycle: 'annual' | 'quarterly' | null;
    selectedPlanId: PlanId | null;
    message: string | null;
    openModal: (cycle?: 'annual' | 'quarterly', customMessage?: string, planId?: PlanId) => void;
    closeModal: () => void;
    showCelebration: boolean;
    openCelebration: () => void;
    closeCelebration: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | undefined>(undefined);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [defaultBillingCycle, setDefaultBillingCycle] = useState<'annual' | 'quarterly' | null>(null);
    const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const { isPremium, isGifted } = useSubscription();
    const [showCelebration, setShowCelebration] = useState(false);

    // Allow opening the upgrade modal for non-premium users OR gifted users
    const openModal = (cycle?: 'annual' | 'quarterly', customMessage?: string, planId?: PlanId) => {
        if (isPremium && !isGifted) return;
        
        if (cycle) setDefaultBillingCycle(cycle);
        else setDefaultBillingCycle(null);
        
        if (planId) setSelectedPlanId(planId);
        else setSelectedPlanId('premium'); // Default to premium
        
        setMessage(customMessage || null);
        setIsOpen(true);
    };
    const closeModal = () => {
        setIsOpen(false);
        setMessage(null);
    };

    const openCelebration = () => setShowCelebration(true);
    const closeCelebration = () => setShowCelebration(false);

    return (
        <UpgradeModalContext.Provider value={{
            isOpen,
            defaultBillingCycle,
            selectedPlanId,
            message,
            openModal,
            closeModal,
            showCelebration,
            openCelebration,
            closeCelebration
        }}>
            {children}
        </UpgradeModalContext.Provider>
    );
}

export function useUpgradeModal() {
    const context = useContext(UpgradeModalContext);
    if (context === undefined) {
        throw new Error('useUpgradeModal must be used within a UpgradeModalProvider');
    }
    return context;
}

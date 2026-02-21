import { createContext, useContext, useState, ReactNode } from 'react';
import { useSubscription } from './SubscriptionContext';

interface UpgradeModalContextType {
    isOpen: boolean;
    defaultBillingCycle: 'annual' | 'quarterly' | null;
    openModal: (cycle?: 'annual' | 'quarterly') => void;
    closeModal: () => void;
    showCelebration: boolean;
    openCelebration: () => void;
    closeCelebration: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | undefined>(undefined);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [defaultBillingCycle, setDefaultBillingCycle] = useState<'annual' | 'quarterly' | null>(null);
    const [showCelebration, setShowCelebration] = useState(false);
    const { isPremium } = useSubscription();

    // Never open the upgrade modal for premium users
    const openModal = (cycle?: 'annual' | 'quarterly') => {
        if (isPremium) return;
        if (cycle) setDefaultBillingCycle(cycle);
        else setDefaultBillingCycle(null);
        setIsOpen(true);
    };
    const closeModal = () => setIsOpen(false);

    const openCelebration = () => setShowCelebration(true);
    const closeCelebration = () => setShowCelebration(false);

    return (
        <UpgradeModalContext.Provider value={{
            isOpen,
            defaultBillingCycle,
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

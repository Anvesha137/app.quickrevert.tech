import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UpgradeModalContextType {
    isOpen: boolean;
    openModal: () => void;
    closeModal: () => void;
    showCelebration: boolean;
    openCelebration: () => void;
    closeCelebration: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | undefined>(undefined);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);

    const openModal = () => setIsOpen(true);
    const closeModal = () => setIsOpen(false);

    const openCelebration = () => setShowCelebration(true);
    const closeCelebration = () => setShowCelebration(false);

    return (
        <UpgradeModalContext.Provider value={{
            isOpen,
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

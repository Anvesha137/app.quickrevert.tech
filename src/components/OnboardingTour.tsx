import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useUIStyle } from '../contexts/UIStyleContext';
import { useTheme } from '../contexts/ThemeContext';

interface OnboardingTourProps {
  userId: string;
  onComplete: () => void;
}

export default function OnboardingTour({ userId, onComplete }: OnboardingTourProps) {
  const { uiStyle } = useUIStyle();
  const { darkMode } = useTheme();

  useEffect(() => {
    // Determine target IDs based on current UI style
    const isMillennial = uiStyle === 'millennial';
    const connectId = isMillennial ? '#tour-connect' : '#tour-connect-classic';
    const metricsId = isMillennial ? '#tour-metrics' : '#tour-metrics-classic';
    const setupId = isMillennial ? '#tour-setup' : '#tour-setup-classic';

    const finishOnboarding = async () => {
      try {
        const { error } = await supabase.auth.updateUser({
          data: { has_completed_onboarding: true }
        });
        if (error) throw error;
        localStorage.setItem(`qr_onboarding_${userId}`, 'completed');
      } catch (error) {
        console.error('Error saving onboarding state:', error);
        toast.error('Failed to complete onboarding, but you can continue!');
      } finally {
        onComplete();
      }
    };

    const driverObj = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      popoverClass: darkMode ? 'driver-popover-dark' : 'driver-popover-light',
      onDestroyStarted: () => {
        if (!driverObj.hasNextStep() || confirm("Are you sure you want to skip the tour?")) {
          driverObj.destroy();
          finishOnboarding();
        }
      },
      steps: [
        {
          popover: {
            title: 'Welcome to QuickRevert ✨',
            description: 'We automate your DMs and comments instantly. Let\'s take a quick 3-step tour of your dashboard!',
            side: "over",
            align: 'center'
          }
        },
        {
          element: connectId,
          popover: {
            title: '1. Connect Instagram',
            description: 'This is the very first step. Connect your account here so we can reply on your behalf.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: setupId,
          popover: {
            title: '2. Setup Progress & Automations',
            description: 'Keep track of your setup here. Once connected, you can create your first Automation rule!',
            side: "left",
            align: 'start'
          }
        },
        {
          element: metricsId,
          popover: {
            title: '3. Track Your Growth',
            description: 'Watch your engagement skyrocket! We\'ll track every DM sent and show you advanced analytics here.',
            side: "top",
            align: 'start'
          }
        }
      ]
    });

    // Start tour after a tiny delay to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      driverObj.drive();
    }, 500);

    return () => {
      clearTimeout(timer);
      driverObj.destroy();
    };
  }, [uiStyle, darkMode, userId, onComplete]);

  // Inject some custom CSS to make driver.js look premium and match the theme
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .driver-popover-dark {
        background-color: #1A1C23 !important;
        color: #fff !important;
        border: 1px solid #2E323D !important;
        border-radius: 1rem !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
      }
      .driver-popover-dark .driver-popover-title {
        color: #fff !important;
        font-weight: 900 !important;
        font-size: 1.25rem !important;
      }
      .driver-popover-dark .driver-popover-description {
        color: #9ca3af !important;
      }
      .driver-popover-dark .driver-popover-footer button {
        background-color: #374151 !important;
        color: #fff !important;
        text-shadow: none !important;
        border: none !important;
        border-radius: 0.5rem !important;
        font-weight: bold !important;
      }
      .driver-popover-dark .driver-popover-footer button.driver-popover-next-btn {
        background-color: #3b82f6 !important;
      }

      .driver-popover-light {
        border-radius: 1rem !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
        border: 1px solid #f3f4f6 !important;
      }
      .driver-popover-light .driver-popover-title {
        font-weight: 900 !important;
        color: #111827 !important;
        font-size: 1.25rem !important;
      }
      .driver-popover-light .driver-popover-description {
        color: #4b5563 !important;
      }
      .driver-popover-light .driver-popover-footer button {
        border-radius: 0.5rem !important;
        font-weight: bold !important;
        border: 1px solid #e5e7eb !important;
        text-shadow: none !important;
        background: #fff !important;
        color: #374151 !important;
      }
      .driver-popover-light .driver-popover-footer button.driver-popover-next-btn {
        background-color: #2563eb !important;
        color: #fff !important;
        border-color: #2563eb !important;
      }
      
      /* Progress text styling */
      .driver-popover-progress-text {
        font-weight: bold !important;
      }
    `}} />
  );
}

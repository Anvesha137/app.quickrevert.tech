import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <div className="prose prose-sm max-w-none text-gray-600">
                        {children}
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export const TermsOfServiceModal: React.FC<{ isOpen: boolean; onClose: () => void }> = (props) => (
    <Modal title="Terms of Service" {...props}>
        <div className="space-y-4">
            <p className="font-medium text-gray-900">Updated on – 01.01.2026</p>

            <p>
                These Terms of Service ("Terms") govern your use of Quickrevert platform– (https://quickrevert.tech) (the "Platform"), an Instagram DM automation SaaS, and any content, services, or features offered on or through the Platform. By accessing or using Quickrevert technologies, you agree to be bound by these Terms, our Privacy Policy, and any other policies referenced herein. If you do not agree, please do not use the Platform.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">1. Access and Registration</h3>
            <p>
                You must be at least 18 years old, or have parental/guardian consent if between 13 and 18, to use quickrevert.tech. By registering, you represent that all information provided is accurate and complete. You are responsible for maintaining the confidentiality of your account and password.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">2. License to Use</h3>
            <p>
                Quickrevert grants you a limited, non-exclusive, non-transferable license to access and use the Platform for your personal or business Instagram account(s), subject to these Terms. You may not:
            </p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Modify, copy, or create derivative works of any part of the Platform.</li>
                <li>Use the Platform for any unlawful, abusive, or unauthorized purpose, including spam or activity prohibited by Instagram/Meta.</li>
                <li>Reverse engineer, decompile, or attempt to extract the source code of the Platform.</li>
                <li>Remove any copyright, trademark, or proprietary notices.</li>
                <li>Resell, sublicense, or transfer your access to any third party.</li>
            </ul>

            <h3 className="text-lg font-bold text-gray-900 mt-6">3. User Content & Conduct</h3>
            <p>
                You are solely responsible for any content, messages, or data you send or automate using Quickrevert technologies. You agree not to use the Platform to harass, threaten, or violate the rights of others, or to post or transmit any unlawful, harmful, or offensive material. We reserve the right to suspend or terminate accounts for violations.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">4. Payments & Refunds</h3>
            <p>
                Access to certain features may require payment of a subscription fee. All payments are processed via third-party providers. All purchases are final and non-refundable, unless otherwise stated in our Refund Policy.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">5. Intellectual Property</h3>
            <p>
                All content, software, trademarks, and materials on https://quickrevert.tech are the property of Quickrevert technologies or its licensors. You may not use, reproduce, or distribute any part of the Platform except as expressly permitted by these Terms.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">6. Disclaimer</h3>
            <p className="uppercase">
                THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND. QUICKREVERT TECHNOLOGIES DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">7. Limitation of Liability</h3>
            <p>
                To the maximum extent permitted by law, Quickrevert technologies shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or data, arising from your use of the Platform.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">8. Indemnity</h3>
            <p>
                You agree to indemnify and hold harmless Quickrevert technologies, its officers, related personal, and employees from any claims, damages, or expenses arising from your use of the Platform or violation of these Terms.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">9. Changes to Terms</h3>
            <p>
                We may update these Terms at any time. Continued use of https://quickrevert.tech after changes constitutes acceptance of the new Terms. Please review this page periodically.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">10. Governing Law</h3>
            <p>
                These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Udaipur, Rajasthan, India.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">11. Contact</h3>
            <p>
                For questions or concerns about these Terms, please contact us at connect@quickrevert.tech.
            </p>
        </div>
    </Modal>
);

export const PrivacyPolicyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = (props) => (
    <Modal title="Privacy Policy" {...props}>
        <div className="space-y-4">
            <p className="font-medium text-gray-900">Updated on – 01.01.2026</p>

            <p>
                This Privacy Policy (the "Policy") describes how QuickRevert Technologies ("we", "us", or "our") collects, uses, maintains, and discloses information from users of our Platform. By accessing or using https://quickrevert.tech/, you consent to the practices described in this Policy. If you do not agree, please do not use the Platform.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">1. Personal Information</h3>
            <p>
                "Personal Information" means information that identifies you, such as your name, email address, and Instagram account details. "Sensitive Personal Information" includes passwords, payment data, and other data protected by law. We only collect information necessary to provide our services.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">2. Information We Collect</h3>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Personal Identifiable Information:</strong> We collect information you provide directly, such as your name, email, and Instagram account details, when you register or use our services.</li>
                <li><strong>Non-Personal Information:</strong> We may collect technical data such as browser type, device, IP address, and usage statistics to improve our Platform.</li>
                <li><strong>Cookies:</strong> We use cookies to enhance your experience. You may disable cookies in your browser, but some features may not function properly.</li>
            </ul>

            <h3 className="text-lg font-bold text-gray-900 mt-6">3. How We Use and Share Information</h3>
            <ul className="list-disc pl-5 space-y-1">
                <li>To provide and operate our Platform and services, including customer support and account management.</li>
                <li>To improve, secure, and customize our Platform.</li>
                <li>To communicate with you about your account, updates, offers, and respond to inquiries.</li>
                <li>We do not sell, trade, or rent your personal information. We may share aggregated, non- identifiable data for analytics or business purposes.</li>
                <li>We may disclose information if required by law or to protect our rights, users, or the public.</li>
            </ul>

            <h3 className="text-lg font-bold text-gray-900 mt-6">4. Your Choices</h3>
            <ul className="list-disc pl-5 space-y-1">
                <li>You may update or delete your information by contacting us. Some information may be required to use our services.</li>
                <li>You may opt out of marketing communications at any time by contacting us.</li>
                <li>You may disable cookies in your browser settings.</li>
            </ul>

            <h3 className="text-lg font-bold text-gray-900 mt-6">5. Your Rights</h3>
            <p>
                Depending on your location, you may have rights regarding your personal information, such as access, correction, deletion, or restriction. To exercise your rights, contact us at connect@quickrevert.tech
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">6. Data Security</h3>
            <p>
                We implement reasonable security measures to protect your information. However, no method of transmission or storage is 100% secure. Use the Platform at your own risk.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">7. Changes to This Policy</h3>
            <p>
                We may update this Policy from time to time. Changes will be posted on this page. Continued use of https://quickrevert.tech/ after changes means you accept the updated policy.
            </p>

            <h3 className="text-lg font-bold text-gray-900 mt-6">8. Contact</h3>
            <p>
                For questions or concerns about this Policy, contact us at connect@quickrevert.tech
            </p>
        </div>
    </Modal>
);

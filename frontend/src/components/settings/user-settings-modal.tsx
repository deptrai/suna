'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Settings,
    CreditCard,
    KeyRound,
    X,
    User,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { isLocalMode } from '@/lib/config';
import { LocalEnvManager } from '@/components/env-manager/local-env-manager';
import { useIsMobile } from '@/hooks/use-mobile';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { 
    useAccountDeletionStatus, 
    useRequestAccountDeletion, 
    useCancelAccountDeletion 
} from '@/hooks/react-query/account/use-account-deletion';
import { backendApi } from '@/lib/api-client';

// Import billing modal content components
import {
    getSubscription,
    createPortalSession,
    cancelSubscription,
    reactivateSubscription,
    SubscriptionStatus,
} from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { PricingSection } from '@/components/home/sections/pricing-section';
import { CreditBalanceDisplay, CreditPurchaseModal } from '@/components/billing/credit-purchase';
import { useSubscriptionCommitment } from '@/hooks/react-query/subscriptions/use-subscriptions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Zap,
    AlertTriangle,
    Shield,
    CheckCircle,
    RotateCcw,
    Clock
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';

type TabId = 'general' | 'plan' | 'billing' | 'env-manager';

interface Tab {
    id: TabId;
    label: string;
    icon: React.ElementType;
    disabled?: boolean;
}interface UserSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTab?: TabId;
    returnUrl?: string;
}

export function UserSettingsModal({
    open,
    onOpenChange,
    defaultTab = 'general',
    returnUrl = typeof window !== 'undefined' ? window?.location?.href || '/' : '/',
}: UserSettingsModalProps) {
    const isMobile = useIsMobile();
    const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
    const isLocal = isLocalMode();

    // Build tabs array based on local mode
    const tabs: Tab[] = [
        { id: 'general', label: 'General', icon: Settings },
        { id: 'plan', label: 'Plan', icon: Zap },
        { id: 'billing', label: 'Billing', icon: CreditCard },
        ...(isLocal ? [{ id: 'env-manager' as TabId, label: 'Env Manager', icon: KeyRound }] : []),
    ];    // Update active tab when defaultTab changes
    useEffect(() => {
        setActiveTab(defaultTab);
    }, [defaultTab]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "p-0 gap-0 overflow-hidden",
                    isMobile ? "w-full h-full max-w-full rounded-none" : "max-w-6xl max-h-[90vh]"
                )}
                hideCloseButton={true}
            >
                {/* Hidden title for accessibility */}
                <DialogTitle className="sr-only">Settings</DialogTitle>

                {/* Header - only on mobile */}
                {isMobile && (
                    <DialogHeader className="p-4 border-b border-border">
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-semibold">Settings</div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onOpenChange(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>
                )}                <div className={cn("flex", isMobile ? "flex-col h-full" : "flex-row  h-[700px]")}>
                    {/* Sidebar */}
                    <div className={cn(
                        "bg-background",
                        isMobile ? "p-2" : "w-56 p-4"
                    )}>
                        {/* Custom Close Button - Desktop only */}
                        {!isMobile && (
                            <div className="flex justify-start mb-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => onOpenChange(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                        <div className={cn(
                            "flex gap-2",
                            isMobile ? "flex-row overflow-x-auto" : "flex-col"
                        )}>
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;

                                return (
                                    <SpotlightCard
                                        key={tab.id}
                                        className={cn(
                                            "transition-colors cursor-pointer",
                                            isActive ? "bg-muted" : "bg-transparent"
                                        )}
                                    >
                                        <button
                                            onClick={() => setActiveTab(tab.id)}
                                            disabled={tab.disabled}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-3 text-sm",
                                                isActive
                                                    ? "text-foreground"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {tab.label}
                                        </button>
                                    </SpotlightCard>
                                );
                            })}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto">
                        {activeTab === 'general' && <GeneralTab onClose={() => onOpenChange(false)} />}
                        {activeTab === 'plan' && <PlanTab returnUrl={returnUrl} />}
                        {activeTab === 'billing' && <BillingTab returnUrl={returnUrl} />}
                        {activeTab === 'env-manager' && isLocal && <EnvManagerTab />}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// General Tab Component
function GeneralTab({ onClose }: { onClose: () => void }) {
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const supabase = createClient();

    const { data: deletionStatus, isLoading: isCheckingStatus } = useAccountDeletionStatus();
    const requestDeletion = useRequestAccountDeletion();
    const cancelDeletion = useCancelAccountDeletion();

    useEffect(() => {
        const fetchUserData = async () => {
            setIsLoading(true);
            const { data } = await supabase.auth.getUser();
            if (data.user) {
                setUserName(data.user.user_metadata?.name || data.user.email?.split('@')[0] || '');
                setUserEmail(data.user.email || '');
            }
            setIsLoading(false);
        };

        fetchUserData();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { data, error } = await supabase.auth.updateUser({
                data: { name: userName }
            });

            if (error) throw error;

            toast.success('Profile updated successfully');

            setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRequestDeletion = async () => {
        await requestDeletion.mutateAsync('User requested deletion');
        setShowDeleteDialog(false);
        setDeleteConfirmText('');
    };

    const handleCancelDeletion = async () => {
        await cancelDeletion.mutateAsync();
        setShowCancelDialog(false);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-32" />
                <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-1">Profile Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your account information
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                        id="name"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="Enter your name"
                        className="shadow-none"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        value={userEmail}
                        disabled
                        className="bg-muted/50 cursor-not-allowed shadow-none"
                    />
                    <p className="text-xs text-muted-foreground">
                        Email cannot be changed from here
                    </p>
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button
                    variant="outline"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            {!isLocalMode() && (
                <>
                    <div className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold mb-1 text-destructive">Danger Zone</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Permanently delete your account and all associated data
                        </p>

                        {deletionStatus?.has_pending_deletion ? (
                            <Alert variant="destructive" className="shadow-none">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    <div className="text-sm">
                                        <strong>Account Deletion Scheduled</strong>
                                        <p className="mt-1">
                                            Your account and all data will be permanently deleted on{' '}
                                            <strong>{formatDate(deletionStatus.deletion_scheduled_for)}</strong>.
                                        </p>
                                        <p className="mt-2 text-muted-foreground">
                                            You can cancel this request anytime before the deletion date.
                                        </p>
                                    </div>
                                </AlertDescription>
                                <div className="mt-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowCancelDialog(true)}
                                        disabled={cancelDeletion.isPending}
                                    >
                                        Cancel Deletion
                                    </Button>
                                </div>
                            </Alert>
                        ) : (
                            <>
                                <Button
                                    variant="destructive"
                                    onClick={() => setShowDeleteDialog(true)}
                                    className="w-full sm:w-auto"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Account
                                </Button>
                                
                                {isLocalMode() && (
                                    <Button
                                        variant="destructive"
                                        onClick={async () => {
                                            if (confirm('⚠️ TEST MODE: This will IMMEDIATELY delete your account. Continue?')) {
                                                try {
                                                    const response = await backendApi.delete('/account/delete-immediately');
                                                    if (response.success) {
                                                        toast.success('Account deleted immediately (test mode)');
                                                        setTimeout(() => window.location.href = '/login', 1000);
                                                    }
                                                } catch (error) {
                                                    toast.error('Failed to delete account');
                                                }
                                            }
                                        }}
                                        className="w-full sm:w-auto mt-2"
                                        size="sm"
                                    >
                                        🧪 Test: Delete Immediately
                                    </Button>
                                )}
                            </>
                        )}
                    </div>

                    <Dialog open={showDeleteDialog} onOpenChange={(open) => {
                        setShowDeleteDialog(open);
                        if (!open) setDeleteConfirmText('');
                    }}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Delete Account</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <Alert variant="destructive" className="shadow-none">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        <strong>This action cannot be undone after 30 days</strong>
                                    </AlertDescription>
                                </Alert>
                                <p className="text-sm text-muted-foreground">
                                    When you delete your account:
                                </p>
                                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                                    <li>All your agents and agent versions will be deleted</li>
                                    <li>All your threads and conversations will be deleted</li>
                                    <li>All your credentials and integrations will be removed</li>
                                    <li>Your subscription will be cancelled</li>
                                    <li>All billing data will be removed</li>
                                    <li>Your account will be scheduled for deletion in 30 days</li>
                                </ul>
                                <p className="text-sm text-muted-foreground">
                                    You can cancel this request anytime within the 30-day grace period.
                                    After 30 days, all your data will be permanently deleted and cannot be recovered.
                                </p>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="delete-confirm">
                                        Type <strong>delete</strong> to confirm
                                    </Label>
                                    <Input
                                        id="delete-confirm"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        placeholder="delete"
                                        className="shadow-none"
                                        autoComplete="off"
                                    />
                                </div>
                                
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" onClick={() => {
                                        setShowDeleteDialog(false);
                                        setDeleteConfirmText('');
                                    }}>
                                        Keep Account
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        onClick={handleRequestDeletion} 
                                        disabled={requestDeletion.isPending || deleteConfirmText !== 'delete'}
                                    >
                                        {requestDeletion.isPending ? 'Processing...' : 'Delete Account'}
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                        <AlertDialogContent className="max-w-md">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Cancel Account Deletion</AlertDialogTitle>
                            </AlertDialogHeader>
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Are you sure you want to cancel the deletion of your account?
                                    Your account and all data will be preserved.
                                </p>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                                        Back
                                    </Button>
                                    <Button 
                                        onClick={handleCancelDeletion} 
                                        disabled={cancelDeletion.isPending}
                                    >
                                        {cancelDeletion.isPending ? 'Processing...' : 'Cancel Deletion'}
                                    </Button>
                                </div>
                            </div>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    );
}

function PlanTab({ returnUrl }: { returnUrl: string }) {
    return (
        <div className="overflow-y-auto max-h-full flex items-center justify-center py-6">
            <PricingSection
                returnUrl={returnUrl}
                showTitleAndTabs={false}
                showInfo={false}
                insideDialog={false}
                noPadding={false}
            />
        </div>
    );
}

// Billing Tab Component - Usage, credits, subscription management
function BillingTab({ returnUrl }: { returnUrl: string }) {
    const { session, isLoading: authLoading } = useAuth();
    const queryClient = useQueryClient();
    const [subscriptionData, setSubscriptionData] = useState<SubscriptionStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isManaging, setIsManaging] = useState(false);
    const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    const {
        data: commitmentInfo,
        isLoading: commitmentLoading,
        error: commitmentError,
        refetch: refetchCommitment
    } = useSubscriptionCommitment(subscriptionData?.subscription?.id || null);

    const fetchSubscriptionData = async () => {
        if (!session) return;

        try {
            setIsLoading(true);
            const data = await getSubscription();
            setSubscriptionData(data);
            setError(null);
            return data;
        } catch (err) {
            console.error('Failed to get subscription:', err);
            setError(err instanceof Error ? err.message : 'Failed to load subscription data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading || !session) return;
        fetchSubscriptionData();
    }, [session, authLoading]);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatEndDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    const getEffectiveCancellationDate = () => {
        if (subscriptionData?.subscription?.cancel_at) {
            return formatDate(subscriptionData.subscription.cancel_at);
        }
        return formatDate(subscriptionData?.subscription?.current_period_end || 0);
    };

    const handleManageSubscription = async () => {
        try {
            setIsManaging(true);
            const { url } = await createPortalSession({ return_url: returnUrl });
            window.location.href = url;
        } catch (err) {
            console.error('Failed to create portal session:', err);
            setError(err instanceof Error ? err.message : 'Failed to create portal session');
        } finally {
            setIsManaging(false);
        }
    };

    const handleCancel = async () => {
        setIsCancelling(true);
        const originalState = subscriptionData;

        try {
            setShowCancelDialog(false);

            if (subscriptionData?.subscription) {
                const optimisticState = {
                    ...subscriptionData,
                    subscription: {
                        ...subscriptionData.subscription,
                        cancel_at_period_end: true,
                        ...(commitmentInfo?.has_commitment && commitmentInfo.commitment_end_date ? {
                            cancel_at: Math.floor(new Date(commitmentInfo.commitment_end_date).getTime() / 1000)
                        } : {})
                    }
                };
                setSubscriptionData(optimisticState);
            }

            const response = await cancelSubscription();

            if (response.success) {
                toast.success(response.message);
            } else {
                setSubscriptionData(originalState);
                toast.error(response.message);
            }
        } catch (error: any) {
            console.error('Error cancelling subscription:', error);
            setSubscriptionData(originalState);
            toast.error(error.message || 'Failed to cancel subscription');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleReactivate = async () => {
        setIsCancelling(true);
        const originalState = subscriptionData;

        try {
            if (subscriptionData?.subscription) {
                const optimisticState = {
                    ...subscriptionData,
                    subscription: {
                        ...subscriptionData.subscription,
                        cancel_at_period_end: false,
                        cancel_at: undefined
                    }
                };
                setSubscriptionData(optimisticState);
            }

            const response = await reactivateSubscription();

            if (response.success) {
                toast.success(response.message);
            } else {
                setSubscriptionData(originalState);
                toast.error(response.message);
            }
        } catch (error: any) {
            console.error('Error reactivating subscription:', error);
            setSubscriptionData(originalState);
            toast.error(error.message || 'Failed to reactivate subscription');
        } finally {
            setIsCancelling(false);
        }
    };

    if (isLoading || authLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-32" />
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        );
    }

    if (isLocalMode()) {
        return (
            <div className="p-6">
                <Alert className="border-blue-500/50 bg-blue-500/10">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <AlertDescription>
                        <div className="font-medium mb-1">Local Mode Active</div>
                        <div className="text-sm text-muted-foreground">
                            All premium features are available in this environment
                        </div>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const isSubscribed = subscriptionData?.subscription?.status === 'active' || subscriptionData?.subscription?.status === 'trialing';
    const subscription = subscriptionData?.subscription;
    const isCancelled = subscription?.cancel_at_period_end || subscription?.cancel_at;

    return (
        <div className="p-6 space-y-6">
            {/* Current Subscription Status */}
            {isSubscribed && subscription && (
                <Card className="shadow-none">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Current Plan</CardTitle>
                            {isCancelled ? (
                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Cancelling
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Active
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Plan</p>
                                <p className="font-medium">{subscriptionData.plan_name || 'Premium'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-muted-foreground">
                                    {subscription.current_period_end && `Next billing date`}
                                </p>
                                <p className="font-medium">
                                    {subscription.current_period_end && formatDate(subscription.current_period_end)}
                                </p>
                            </div>
                        </div>

                        {/* Commitment info */}
                        {commitmentInfo?.has_commitment && (
                            <Alert className="border-blue-500/50 bg-blue-500/10 shadow-none">
                                <Shield className="h-4 w-4 text-blue-500" />
                                <AlertDescription>
                                    <div className="text-sm">
                                        <strong>Annual Commitment Active</strong>
                                        <p className="text-muted-foreground mt-1">
                                            Your commitment ends on {formatEndDate(commitmentInfo.commitment_end_date)}
                                        </p>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Cancellation notice */}
                        {isCancelled && (
                            <Alert variant="destructive" className="shadow-none">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    <div className="text-sm">
                                        Your subscription will be cancelled on {getEffectiveCancellationDate()}
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="flex gap-2 pt-2">
                            {isCancelled ? (
                                <Button
                                    onClick={handleReactivate}
                                    disabled={isCancelling}
                                    className="flex-1"
                                >
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    {isCancelling ? 'Reactivating...' : 'Reactivate Subscription'}
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        onClick={handleManageSubscription}
                                        disabled={isManaging}
                                        variant="outline"
                                        className="flex-1"
                                    >
                                        {isManaging ? 'Loading...' : 'Manage Subscription'}
                                    </Button>
                                    <Button
                                        onClick={() => setShowCancelDialog(true)}
                                        variant="outline"
                                        className="flex-1 text-destructive hover:text-destructive"
                                    >
                                        Cancel Plan
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Credit Balance */}
            <div>
                <CreditBalanceDisplay
                    balance={subscriptionData?.credit_balance || 0}
                    canPurchase={subscriptionData?.can_purchase_credits || false}
                    onPurchaseClick={() => setShowCreditPurchaseModal(true)}
                />
            </div>            {/* Cancel Dialog */}
            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancel Subscription</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to cancel your subscription? You'll continue to have access until{' '}
                            {subscription?.current_period_end && formatDate(subscription.current_period_end)}.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                                Keep Subscription
                            </Button>
                            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
                                {isCancelling ? 'Cancelling...' : 'Cancel Plan'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Credit Purchase Modal */}
            <CreditPurchaseModal
                open={showCreditPurchaseModal}
                onOpenChange={setShowCreditPurchaseModal}
                currentBalance={subscriptionData?.credit_balance || 0}
                canPurchase={subscriptionData?.can_purchase_credits || false}
                onPurchaseComplete={() => {
                    fetchSubscriptionData();
                }}
            />
        </div>
    );
}

// Env Manager Tab Component
function EnvManagerTab() {
    return (
        <div className="p-6">
            <LocalEnvManager />
        </div>
    );
}

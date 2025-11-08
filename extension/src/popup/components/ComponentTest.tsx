/**
 * Component Test Component
 * Tests UI components imported from frontend
 * 
 * This component tests Button, Card, và Dialog components
 * to verify they work correctly trong extension popup
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ComponentTest() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Component Test</h1>
      <p className="text-muted-foreground">
        Testing UI components imported from frontend
      </p>

      {/* Button Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Button Component Tests</CardTitle>
          <CardDescription>
            Testing Button component với different variants và sizes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="default">Default Button</Button>
            <Button variant="destructive">Destructive Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="link">Link Button</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Small Button</Button>
            <Button size="default">Default Size</Button>
            <Button size="lg">Large Button</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled>Disabled Button</Button>
            <Button variant="default" disabled>
              Disabled Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Card Component Tests</CardTitle>
          <CardDescription>
            Testing Card component với different content layouts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This is a card content area. Card component is working correctly.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline">Card Footer Button</Button>
        </CardFooter>
      </Card>

      {/* Dialog Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Dialog Component Tests</CardTitle>
          <CardDescription>
            Testing Dialog component với open/close functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Test Dialog</DialogTitle>
                <DialogDescription>
                  This is a test dialog to verify Dialog component works
                  correctly trong extension popup.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm">
                  Dialog content goes here. You can close this dialog by clicking
                  the close button or clicking outside.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}


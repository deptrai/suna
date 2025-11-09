/**
 * Component Test Component
 * 
 * Tests Button, Card, và Dialog components từ frontend.
 * Story 12.1: Shared UI Components Integration
 */

import { useState } from 'react';
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
    <div className="p-6 space-y-8 bg-background text-foreground min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Component Test</h1>
        <p className="text-muted-foreground mb-8">
          Testing shared UI components từ frontend
        </p>

        {/* Button Component Tests */}
        <section className="space-y-4 mb-8">
          <h2 className="text-2xl font-semibold">Button Component</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>Test all button variants</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button variant="default">Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button Sizes</CardTitle>
              <CardDescription>Test all button sizes</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button States</CardTitle>
              <CardDescription>Test button với disabled và loading states</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button disabled>Disabled</Button>
              <Button onClick={() => alert('Clicked!')}>Clickable</Button>
            </CardContent>
          </Card>
        </section>

        {/* Card Component Tests */}
        <section className="space-y-4 mb-8">
          <h2 className="text-2xl font-semibold">Card Component</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Card với Header và Title</CardTitle>
              <CardDescription>Card description text</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Card content goes here. This is a test of the Card component với all subcomponents.</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline">Footer Button</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simple Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p>This is a simpler card với just header và content.</p>
            </CardContent>
          </Card>
        </section>

        {/* Dialog Component Tests */}
        <section className="space-y-4 mb-8">
          <h2 className="text-2xl font-semibold">Dialog Component</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Dialog Test</CardTitle>
              <CardDescription>Test Dialog open/close functionality</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dialog Title</DialogTitle>
                    <DialogDescription>
                      This is a test dialog. Click outside or press ESC to close.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <p>Dialog content goes here.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => setDialogOpen(false)}>
                      Confirm
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="secondary"
                onClick={() => {
                  alert('Button clicked! Dialog component is working.');
                }}
              >
                Test Alert
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Integration Test */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Integration Test</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Components Together</CardTitle>
              <CardDescription>Test all components working together</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>This card contains multiple components:</p>
              <div className="flex gap-4">
                <Button variant="default">Action 1</Button>
                <Button variant="outline">Action 2</Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Open Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Integration Test Dialog</DialogTitle>
                      <DialogDescription>
                        This dialog is opened from a button inside a card.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <p>All components are working together correctly!</p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline">Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="ghost">Footer Action</Button>
            </CardFooter>
          </Card>
        </section>
      </div>
    </div>
  );
}


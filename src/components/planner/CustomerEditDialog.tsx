"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { findCustomer, findCustomerKey } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/planner/ui/FormField";
import { TownCombobox } from "@/components/planner/TownCombobox";

export function CustomerEditDialog({
  customerKey,
  areaOptions,
  open,
  onOpenChange,
}: {
  customerKey: string | null;
  areaOptions: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const customers = useStore((s) => s.customers);
  const updateCustomer = useStore((s) => s.updateCustomer);
  const customer = customerKey ? findCustomer(customers, customerKey) : undefined;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [town, setTown] = useState("");
  const [load, setLoad] = useState("");
  const [collection, setCollection] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !customerKey) return;
    const current = findCustomer(useStore.getState().customers, customerKey);
    if (!current) {
      onOpenChange(false);
      return;
    }
    setName(current.name);
    setCode(current.code);
    setTown(current.defaultArea);
    setLoad(current.loadingNumber > 0 ? String(current.loadingNumber) : "");
    setCollection(!!current.collection);
    setError("");
    // Only re-seed when the dialog opens or the customer identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerKey]);

  function close() {
    onOpenChange(false);
  }

  function save() {
    if (!customerKey || !customer) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Customer name is required");
      return;
    }
    const n = Math.floor(Number(load));
    const loadingNumber = town.trim() && Number.isFinite(n) && n > 0 ? n : 0;
    const id = findCustomerKey(customers, customerKey) ?? customerKey;
    const result = updateCustomer(id, {
      name: cleanName,
      code: code.trim(),
      defaultArea: town.trim(),
      loadingNumber,
      collection,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Saved ${cleanName}`);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            Change the catalog name, code, town, or town load #. Trip-specific load numbers stay as
            typed until you change them on the Trips tab.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormField label="Customer name" htmlFor="edit-customer-name">
            <Input
              id="edit-customer-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Code" htmlFor="edit-customer-code" helper="Account / ERP code, if you have one.">
            <Input
              id="edit-customer-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError("");
              }}
              placeholder="Optional"
              className="metric-mono"
              autoComplete="off"
            />
          </FormField>
          <FormField label="Town">
            <TownCombobox
              value={town}
              options={areaOptions}
              allowEmpty
              emptyOptionLabel="No town"
              placeholder="Assign town…"
              searchPlaceholder="Search towns…"
              onChange={setTown}
              buttonClassName="h-9 w-full"
            />
          </FormField>
          <FormField
            label="Town load #"
            htmlFor="edit-customer-load"
            helper={town ? "Used when this trip has no override." : "Assign a town to set a load #."}
          >
            <Input
              id="edit-customer-load"
              type="number"
              min={0}
              value={load}
              onChange={(e) => setLoad(e.target.value)}
              placeholder="—"
              disabled={!town}
              className="metric-mono h-9 w-28"
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={collection}
              onCheckedChange={(v) => setCollection(!!v)}
              className="size-4"
            />
            Collection customer
          </label>
          {error ? <p className="text-xs text-crit">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

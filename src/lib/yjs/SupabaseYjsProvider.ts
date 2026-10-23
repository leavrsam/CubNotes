import * as Y from "yjs";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { fromUint8Array, toUint8Array } from "js-base64";

export interface UserPresence {
  name: string;
  color: string;
  email?: string;
  avatarUrl?: string;
}

export class SupabaseYjsProvider {
  public doc: Y.Doc;
  public awareness: Awareness;
  public channel: RealtimeChannel;
  public isSynced = false;
  private isDestroyed = false;

  private onDocUpdateHandler: (update: Uint8Array, origin: any) => void;
  private onAwarenessUpdateHandler: (changed: { added: number[]; updated: number[]; removed: number[] }, origin: any) => void;

  constructor(
    supabase: SupabaseClient,
    roomName: string,
    doc: Y.Doc,
    userPresence?: UserPresence
  ) {
    this.doc = doc;
    this.awareness = new Awareness(doc);

    if (userPresence) {
      this.awareness.setLocalStateField("user", userPresence);
    }

    // Create a dedicated Supabase Realtime Broadcast channel for this document room
    this.channel = supabase.channel(`yjs-room-${roomName}`, {
      config: {
        broadcast: {
          ack: false, // low latency unacknowledged UDP-style streaming
          self: false, // don't echo to self
        },
      },
    });

    // 1. Local Doc Updates -> Broadcast to Peers
    this.onDocUpdateHandler = (update: Uint8Array, origin: any) => {
      if (origin === this || this.isDestroyed) return;
      this.channel.send({
        type: "broadcast",
        event: "yjs-update",
        payload: { u: fromUint8Array(update) },
      });
    };
    this.doc.on("update", this.onDocUpdateHandler);

    // 2. Local Awareness (Cursor / Presence) Updates -> Broadcast to Peers
    this.onAwarenessUpdateHandler = ({ added, updated, removed }, origin: any) => {
      if (origin === this || this.isDestroyed) return;
      const changedClients = added.concat(updated, removed);
      const update = encodeAwarenessUpdate(this.awareness, changedClients);
      this.channel.send({
        type: "broadcast",
        event: "awareness-update",
        payload: { a: fromUint8Array(update) },
      });
    };
    this.awareness.on("update", this.onAwarenessUpdateHandler);

    // 3. Remote Listeners
    this.channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        if (this.isDestroyed || !payload?.u) return;
        try {
          const update = toUint8Array(payload.u);
          Y.applyUpdate(this.doc, update, this);
        } catch (err) {
          console.warn("Failed to apply remote Yjs update:", err);
        }
      })
      .on("broadcast", { event: "awareness-update" }, ({ payload }) => {
        if (this.isDestroyed || !payload?.a) return;
        try {
          const update = toUint8Array(payload.a);
          applyAwarenessUpdate(this.awareness, update, this);
        } catch (err) {
          console.warn("Failed to apply remote awareness update:", err);
        }
      })
      .on("broadcast", { event: "sync-step-1" }, ({ payload }) => {
        // Peer is asking for what they missed based on their state vector
        if (this.isDestroyed || !payload?.sv) return;
        try {
          const remoteStateVector = toUint8Array(payload.sv);
          const update = Y.encodeStateAsUpdate(this.doc, remoteStateVector);
          this.channel.send({
            type: "broadcast",
            event: "sync-step-2",
            payload: { u: fromUint8Array(update) },
          });
        } catch (err) {
          console.warn("Failed to respond to sync-step-1:", err);
        }
      })
      .on("broadcast", { event: "sync-step-2" }, ({ payload }) => {
        if (this.isDestroyed || !payload?.u) return;
        try {
          const update = toUint8Array(payload.u);
          Y.applyUpdate(this.doc, update, this);
          this.isSynced = true;
        } catch (err) {
          console.warn("Failed to apply sync-step-2:", err);
        }
      });

    // 4. Subscribe and initiate sync
    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !this.isDestroyed) {
        // Send state vector so active peers can send whatever deltas we lack
        const stateVector = Y.encodeStateVector(this.doc);
        this.channel.send({
          type: "broadcast",
          event: "sync-step-1",
          payload: { sv: fromUint8Array(stateVector) },
        });

        // Broadcast local presence so peers see our cursor immediately
        const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
        this.channel.send({
          type: "broadcast",
          event: "awareness-update",
          payload: { a: fromUint8Array(awarenessUpdate) },
        });
      }
    });
  }

  public setPresence(presence: Partial<UserPresence>) {
    const current = (this.awareness.getLocalState()?.user as UserPresence) || {};
    this.awareness.setLocalStateField("user", { ...current, ...presence });
  }

  public destroy() {
    this.isDestroyed = true;
    this.doc.off("update", this.onDocUpdateHandler);
    this.awareness.off("update", this.onAwarenessUpdateHandler);
    this.awareness.destroy();
    this.channel.unsubscribe();
  }
}

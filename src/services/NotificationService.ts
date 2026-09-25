/**
 * NotificationService.ts
 *
 * Local notifications manager with:
 * - 7 distinct Android notification channels
 * - Selective snooze support (per alert or per channel)
 * - Anti-spam rate limiting
 * - Sound alerts using Web Audio API synthesis
 */

import { AlertEvent, NotificationChannelId } from '../types/brewpi';
import { StorageService } from './StorageService';

export interface NotificationChannelInfo {
  id: NotificationChannelId;
  name: string;
  importance: 'HIGH' | 'DEFAULT' | 'LOW';
  soundEnabled: boolean;
}

export class NotificationService {
  private static audioCtx: AudioContext | null = null;
  private static snoozedRules: Map<string, number> = new Map(); // ruleKey -> timestamp
  private static lastNotificationTimes: Map<string, number> = new Map(); // ruleKey -> timestamp

  public static readonly CHANNELS: Record<NotificationChannelId, NotificationChannelInfo> = {
    channel_connection: {
      id: 'channel_connection',
      name: 'ESP32 Connection',
      importance: 'HIGH',
      soundEnabled: true
    },
    channel_beer_sensor: {
      id: 'channel_beer_sensor',
      name: 'Beer Sensor Faults',
      importance: 'HIGH',
      soundEnabled: true
    },
    channel_fridge_sensor: {
      id: 'channel_fridge_sensor',
      name: 'Fridge Sensor Faults',
      importance: 'HIGH',
      soundEnabled: true
    },
    channel_room_sensor: {
      id: 'channel_room_sensor',
      name: 'Room Sensor Faults',
      importance: 'DEFAULT',
      soundEnabled: true
    },
    channel_temperature_alarm: {
      id: 'channel_temperature_alarm',
      name: 'Temperature Out of Range',
      importance: 'HIGH',
      soundEnabled: true
    },
    channel_memory_filesystem: {
      id: 'channel_memory_filesystem',
      name: 'ESP32 Memory & Storage',
      importance: 'DEFAULT',
      soundEnabled: false
    },
    channel_recovery: {
      id: 'channel_recovery',
      name: 'Recovery Notifications',
      importance: 'LOW',
      soundEnabled: false
    },
    channel_monitoring_service: {
      id: 'channel_monitoring_service',
      name: 'Background Monitoring Service',
      importance: 'LOW',
      soundEnabled: false
    }
  };

  /**
   * Request browser notification permission
   */
  public static async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission === 'granted') {
      return true;
    }
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  public static isPermissionGranted(): boolean {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    return Notification.permission === 'granted';
  }

  /**
   * Snooze a specific alert or rule for a duration
   */
  public static snoozeRule(ruleKey: string, durationMs: number): void {
    const until = Date.now() + durationMs;
    this.snoozedRules.set(ruleKey, until);
  }

  public static isRuleSnoozed(ruleKey: string): boolean {
    const until = this.snoozedRules.get(ruleKey);
    if (!until) return false;
    if (Date.now() > until) {
      this.snoozedRules.delete(ruleKey);
      return false;
    }
    return true;
  }

  public static getSnoozedUntil(ruleKey: string): number | null {
    const until = this.snoozedRules.get(ruleKey);
    if (!until) return null;
    if (Date.now() > until) {
      this.snoozedRules.delete(ruleKey);
      return null;
    }
    return until;
  }

  public static clearSnooze(ruleKey: string): void {
    this.snoozedRules.delete(ruleKey);
  }

  /**
   * Send a local notification if not snoozed and not in repeat-interval suppression
   */
  public static notify(alert: AlertEvent, channelId: NotificationChannelId, repeatIntervalMinutes: number = 30): boolean {
    const ruleKey = `${alert.eventType}_${alert.sensor || 'general'}`;

    // 1. Check selective snooze
    if (this.isRuleSnoozed(ruleKey)) {
      return false;
    }

    // 2. Check anti-spam repeat interval (unless it's a recovery notification)
    if (alert.eventType !== 'CONNECTION_RECOVERED' && alert.eventType !== 'TEMP_RECOVERED' && alert.eventType !== 'SENSOR_RECOVERED') {
      const lastTime = this.lastNotificationTimes.get(ruleKey);
      if (lastTime && Date.now() - lastTime < repeatIntervalMinutes * 60 * 1000) {
        // Suppress repeated alert
        return false;
      }
    }

    this.lastNotificationTimes.set(ruleKey, Date.now());

    // 3. Play audio chime if configured
    const channel = this.CHANNELS[channelId];
    if (channel?.soundEnabled && alert.severity !== 'info') {
      this.playAlertSound(alert.severity === 'critical' ? 'critical' : 'warning');
    }

    // 4. Native Notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const options: any = {
          body: alert.message,
          icon: '/favicon.ico',
          tag: ruleKey,
          renotify: true
        };
        new Notification(`BrewPiLess: ${alert.ruleDescription}`, options);
      } catch (err) {
        console.warn('Notification display failed', err);
      }
    }

    return true;
  }

  /**
   * Synthesize an alert sound using Web Audio API
   */
  public static playAlertSound(type: 'warning' | 'critical' | 'chime' = 'warning'): void {
    try {
      const soundEnabled = StorageService.getSettings()?.enableSoundAlerts ?? true;
      if (!soundEnabled) return;

      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'critical') {
        // High-pitched double beep (880Hz -> 1174Hz)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174, now + 0.15);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'warning') {
        // Single warm beep (587Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        // Recovery chime (440Hz -> 659Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.2);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Audio autoplay policy might prevent sound before user gesture
      console.warn('Audio synthesis notice:', e);
    }
  }
}

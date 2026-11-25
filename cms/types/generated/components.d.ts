import type { Schema, Struct } from '@strapi/strapi';

export interface ScheduleTimeRange extends Struct.ComponentSchema {
  collectionName: 'components_schedule_time_ranges';
  info: {
    displayName: 'Time range \u6642\u6BB5';
    icon: 'clock';
  };
  attributes: {
    end: Schema.Attribute.Time & Schema.Attribute.Required;
    start: Schema.Attribute.Time & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'schedule.time-range': ScheduleTimeRange;
    }
  }
}

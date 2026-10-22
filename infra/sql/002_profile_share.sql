-- Profile screen + recent drives: where a trip was headed, as the driver named it.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS destination_name text;

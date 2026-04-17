package logger

import (
	"os"

	"github.com/sirupsen/logrus"
)

var Log = logrus.New()

func init() {
	Log.SetFormatter(&logrus.JSONFormatter{})
	Log.SetOutput(os.Stdout)
	Log.SetLevel(logrus.InfoLevel)
}

func Info(msg string, fields logrus.Fields) {
	Log.WithFields(fields).Info(msg)
}

func Error(msg string, fields logrus.Fields) {
	Log.WithFields(fields).Error(msg)
}

func Fatal(msg string, fields logrus.Fields) {
	Log.WithFields(fields).Fatal(msg)
}

// LogEvent is a helper for structured events the Electron app expects
func LogEvent(eventType string, payload interface{}) {
	Log.WithFields(logrus.Fields{
		"type":    eventType,
		"payload": payload,
	}).Info("event")
}

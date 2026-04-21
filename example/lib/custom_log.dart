import 'dart:developer' as console;
import 'package:flutter/material.dart';
import 'package:logger/logger.dart';

enum LogMode { developer, logger, debug }

class CustomLog {
  final LogMode mode;
  final Logger _logger = Logger();

  CustomLog.developer() : mode = LogMode.developer;
  CustomLog.logger()    : mode = LogMode.logger;
  CustomLog.debug()     : mode = LogMode.debug;

  String log(String text) {
    switch (mode) {
      case LogMode.developer:
        console.log(text); // ログストリームに出力：コマンドライン等では出ないため注意
      case LogMode.logger:
        _logger.d(text);
      case LogMode.debug:
        debugPrint(text);
    }
    return text;
  }
}

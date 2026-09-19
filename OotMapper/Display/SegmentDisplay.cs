using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using OotMapper.Model;
using OotMapper.Types;

namespace OotMapper.Display {
	public class SegmentDisplay {
		private const double EntranceIconSize = 12;
		private const int SegShapeZ = 0;
		private const int EntranceShapeZ = 20;

		public Size Size => _baseMapInfo.GetSegment(_segmentId).Size;
		public Coord Pos => _layout.GetSegmentPos(_segmentId);
		public Dictionary<string, Entrance> Entrances => _baseMapInfo.GetSegment(_segmentId).Entrances;

		private MapDisplay _map;
		private string _segmentId;
		private Layout _layout;
		private BaseMapInfo _baseMapInfo;
		private Image _segImage;
		public readonly Dictionary<string, EntranceDisplay> EntranceDisplays = new Dictionary<string, EntranceDisplay>();

		private bool _isDragged = false;
		private Coord _dragOffset = new Coord(0, 0);

		public SegmentDisplay(MapDisplay map, Layout layout, BaseMapInfo baseMapInfo, string segmentId) {
			_map = map;
			_layout = layout;
			_baseMapInfo = baseMapInfo;
			_segmentId = segmentId;

			BitmapImage img = new BitmapImage(new Uri(Path.Combine(Files.SegmentsDir, $"{segmentId}_L.png"), UriKind.Relative));

			if (DevPowers.AutofixSegmentAspectRatios) {
				double aspectRatio = (double)img.PixelHeight / img.PixelWidth;
				Size baseSize = _baseMapInfo.GetSegment(segmentId).Size;
				_baseMapInfo.GetSegment(segmentId).Size = new Size(Math.Round(baseSize.Width, 3), Math.Round(baseSize.Width * aspectRatio, 3));
			}

			_segImage = new Image {
				Source = img,
				Opacity = 0.9,
				Stretch = Stretch.Fill,
				Cursor = Cursors.SizeAll
			};
			if (DevPowers.BasemapEditing) {
				_segImage.ContextMenu = EditBasemapMenu();
			}
			_segImage.MouseLeftButtonDown += Segment_MouseDown;
			_map.Add(_segImage, SegShapeZ);
		}

		public void Refresh() {
			RefreshSegImage();
			RegisterNewEntrances();
			RefreshEntrances();
		}

		private void RegisterNewEntrances() {
			foreach (string entranceId in Entrances.Keys) {
				if (!EntranceDisplays.ContainsKey(entranceId)) {
					Entrance newEntrance = Entrances[entranceId];
					EntranceDisplays.Add(entranceId, new EntranceDisplay(this, _map, newEntrance, entranceId));
				}
			}
		}

		private void RefreshSegImage() {
			Size transformedSize = _map.View.SizeModelToView(Size);
			Coord transformedPos = _map.View.PosModelToView(Pos);

			_segImage.Height = transformedSize.Height;
			_segImage.Width = transformedSize.Width;
			_map.Move(_segImage, transformedPos);
		}

		private void RefreshEntrances() {
			foreach (EntranceDisplay entrance in EntranceDisplays.Values) {
				entrance.Refresh();
			}
		}

		private void Segment_MouseDown(object sender, MouseButtonEventArgs e) {
			Coord mousePos = _map.GetModelMousePos(e);
			_dragOffset = mousePos - Pos;
			_isDragged = true;
			_segImage.CaptureMouse();
		}

		public void OnMouseMove(MouseEventArgs e) {
			if (Mouse.LeftButton != MouseButtonState.Pressed) {
				_isDragged = false;
				_segImage.ReleaseMouseCapture();
			}

			if (!_isDragged) {
				return;
			}

			_layout.SetSegmentPos(_segmentId, _map.GetModelMousePos(e) - _dragOffset);
			_map.Refresh();
		}

		// Dev Powers
		public ContextMenu EditBasemapMenu() {
			ContextMenu menu = new ContextMenu();
			MenuItem addEntranceItem = new MenuItem { Header = "Add Entrance", Background = Brushes.MediumPurple };
			addEntranceItem.Click += AddEntrance;
			menu.Items.Add(addEntranceItem);
			MenuItem sizePlusItem = new MenuItem { Header = "Increase Size", Background = Brushes.MediumPurple };
			sizePlusItem.Click += SizeUp;
			menu.Items.Add(sizePlusItem);
			MenuItem sizeMinusItem = new MenuItem { Header = "Decrease Size", Background = Brushes.MediumPurple };
			sizeMinusItem.Click += SizeDown;
			menu.Items.Add(sizeMinusItem);
			return menu;
		}

		private void SizeUp(object sender, RoutedEventArgs e) {
			SizeDelta(0.05);
		}

		private void SizeDown(object sender, RoutedEventArgs e) {
			SizeDelta(-0.05);
		}

		private void SizeDelta(double delta) {
			double mult = 1 + delta;
			MapSegment seg = _baseMapInfo.GetSegment(_segmentId);
			seg.Size = new Size(seg.Size.Width * mult, seg.Size.Height * mult);
			_map.Refresh();
		}

		private void AddEntrance(object sender, RoutedEventArgs e) {
			SaveFileDialog saveFileDialog = new SaveFileDialog {
				Title = "Entrance Naming Hack Woo",
				Filter = "Fake File (*.fake)|*.fake"
			};
			if (saveFileDialog.ShowDialog() == true) {
				string id = Path.GetFileNameWithoutExtension(saveFileDialog.FileName);
				_baseMapInfo.GetSegment(_segmentId).Entrances.Add(id, new Entrance(EntranceType.Outdoor, new Coord(0.5, 0.5)));
			}

		}
	}
}

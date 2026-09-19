using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using OotMapper.Model;
using OotMapper.Types;

namespace OotMapper.Display {
	public class EntranceDisplay {
		private readonly Dictionary<EntranceType, string> Icon = new Dictionary<EntranceType, string> {
			{ EntranceType.Outdoor, "entrance" },
			{ EntranceType.Owl, "owl" },
			{ EntranceType.Indoor, "door" },
			{ EntranceType.Grotto, "grotto" },
			{ EntranceType.Dungeon, "dungeon" }
		};
		private readonly Dictionary<EntranceType, double> IconSize = new Dictionary<EntranceType, double> {
			{ EntranceType.Outdoor, 15 },
			{ EntranceType.Owl, 30},
			{ EntranceType.Indoor, 30 },
			{ EntranceType.Grotto, 15 },
			{ EntranceType.Dungeon, 20 }
		};
		private const int EntranceShapeZ = 20;

		private SegmentDisplay _segment;
		private MapDisplay _map;
		private Entrance _entrance;
		private string _enId;

		private Image _entranceImg;
		private double _aspectRatio;

		public Coord Pos => _segment.Pos + (_segment.Size.AsCoord() * _entrance.FractionCoords);

		public EntranceDisplay(SegmentDisplay segment, MapDisplay map, Entrance entrance, string enId) {
			_segment = segment;
			_map = map;
			_entrance = entrance;
			_enId = enId;

			SetImage();
		}

		public void SetImage() {
			string imgSrc = GetImgSrc();
			if (_entranceImg != null) {
				_map.Remove(_entranceImg);
			}

			BitmapImage img = new BitmapImage(new Uri(imgSrc, UriKind.Relative));
			_aspectRatio = (double)img.PixelHeight / img.PixelWidth;

			_entranceImg = new Image {
				Source = img,
				Cursor = Cursors.Hand,
				ToolTip = _enId
			};

			if (DevPowers.BasemapEditing) {
				_entranceImg.ContextMenu = CreateContextMenu();
			}
			if (EntranceTypeUtil.IsExterior(_entrance.EnType) || DevPowers.BasemapEditing) {
				_entranceImg.MouseLeftButtonDown += ExteriorEntranceClicked;
			}
			_map.Add(_entranceImg, EntranceShapeZ);
		}

		public string GetImgSrc() {
			string icon = Icon[_entrance.EnType];
			return Path.Combine(Files.IconsDir, $"{icon}.png");
		}

		public ContextMenu CreateContextMenu() {
			ContextMenu menu = new ContextMenu();
			if (DevPowers.BasemapEditing) {
				MenuItem toggleType = new MenuItem { Header = "Toggle EntranceType", Background = Brushes.MediumPurple };
				toggleType.Click += ToggleType;
				menu.Items.Add(toggleType);
			}
			return menu;
		}

		private void ToggleType(object sender, RoutedEventArgs e) {
			_entrance.EnType++;
			if (_entrance.EnType == EntranceType.__MAX_VALUE__) {
				_entrance.EnType = 0;
			}
			SetImage();
			Refresh();
		}

		private void ExteriorEntranceClicked(object sender, MouseButtonEventArgs e) {
			_map.ExteriorEntranceClicked(_enId);
		}

		public void Refresh() {
			Coord transformedEntrancePos = _map.View.PosModelToView(Pos);
			double height = IconSize[_entrance.EnType];
			Coord newSize = new Coord(height * _aspectRatio, height);

			if (_enId == "Temple of Time") {
				// Highlight important things? Shine effect or something
				newSize *= 2;
			}

			_entranceImg.Height = newSize.Y;
			_entranceImg.Width = newSize.X;

			Coord adjustedPos = transformedEntrancePos - (newSize / 2); // Centre icon properly

			_map.Move(_entranceImg, adjustedPos);
		}
	}
}
